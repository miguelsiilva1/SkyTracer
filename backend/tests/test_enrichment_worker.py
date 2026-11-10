import json
from pathlib import Path

import httpx
import pytest

from skytracer.enrichment.http import RateLimitedClient
from skytracer.enrichment.worker import Clients, purge_old_data, run_once

pytestmark = pytest.mark.db

FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name: str):
    return json.loads((FIXTURES / name).read_text())


def clients(handler) -> tuple[Clients, list[str]]:
    seen: list[str] = []

    def wrapped(req: httpx.Request):
        seen.append(req.url.path)
        return handler(req)

    http = httpx.Client(transport=httpx.MockTransport(wrapped))
    rl = RateLimitedClient(http, 1000, max_retries=0, sleep=lambda s: None)
    return Clients(adsbdb=rl, planespotters=rl), seen


def api(req: httpx.Request) -> httpx.Response:
    path = req.url.path
    if path.endswith("/aircraft/4d00f1"):
        return httpx.Response(200, json=fixture("adsbdb_aircraft.json"))
    if path.endswith("/callsign/LGL32PR"):
        return httpx.Response(200, json=fixture("adsbdb_callsign.json"))
    if path.endswith("/hex/4d00f1"):
        return httpx.Response(200, json=fixture("planespotters_photos.json"))
    if "/hex/" in path:
        return httpx.Response(200, json={"photos": []})
    return httpx.Response(404, json={"response": "unknown"})


def seed(conn, hex_: str, callsign: str | None):
    conn.execute("INSERT INTO aircraft (hex) VALUES (%s)", (hex_,))
    conn.execute("INSERT INTO aircraft_live (hex, seen_at, callsign) VALUES (%s, now(), %s)",
                 (hex_, callsign))
    conn.commit()


def test_enriches_aircraft_and_route(conn):
    seed(conn, "4d00f1", "LGL32PR")
    c, _ = clients(api)
    assert run_once(conn, c) == (1, 1)

    a = conn.execute("SELECT registration, icao_type, operator, photo_credit, enrich_status "
                     "FROM aircraft WHERE hex='4d00f1'").fetchone()
    assert a == ("LX-LBR", "B737", "Luxair", "Tomas Scheffer", "ok")
    r = conn.execute("SELECT airline_name, origin_icao, dest_icao, status FROM flight_route "
                     "WHERE callsign='LGL32PR'").fetchone()
    assert r == ("Luxair", "LPPR", "ELLX", "ok")


def test_cache_avoids_repeated_requests(conn):
    seed(conn, "4d00f1", "LGL32PR")
    c, seen = clients(api)
    run_once(conn, c)
    n = len(seen)
    assert run_once(conn, c) == (0, 0)
    assert len(seen) == n


def test_not_found_is_cached(conn):
    seed(conn, "abcdef", "ZZZ999")
    c, _ = clients(api)
    run_once(conn, c)
    assert conn.execute("SELECT enrich_status FROM aircraft").fetchone() == ("not_found",)
    assert conn.execute("SELECT status FROM flight_route").fetchone() == ("not_found",)
    assert run_once(conn, c) == (0, 0)


def test_errors_are_retried_later(conn):
    seed(conn, "4d00f1", None)
    c, _ = clients(lambda req: httpx.Response(503))
    run_once(conn, c)
    assert conn.execute("SELECT enrich_status FROM aircraft").fetchone() == ("error",)
    assert run_once(conn, c) == (0, 0)  # só volta a tentar passada 1 h
    conn.execute("UPDATE aircraft SET enriched_at = now() - interval '2 hours'")
    conn.commit()
    assert run_once(conn, c) == (1, 0)


def test_only_live_aircraft_are_enriched(conn):
    conn.execute("INSERT INTO aircraft (hex) VALUES ('4d00f1')")
    conn.commit()
    c, seen = clients(api)
    assert run_once(conn, c) == (0, 0) and seen == []


def test_purge_old_data(conn):
    conn.execute("INSERT INTO aircraft (hex) VALUES ('4d00f1')")
    conn.execute("INSERT INTO position (hex, ts, lat, lon) VALUES "
                 "('4d00f1', now() - interval '31 days', 41, -8), ('4d00f1', now(), 41, -8)")
    conn.execute("INSERT INTO receiver_snapshot (ts) VALUES (now() - interval '40 days'), (now())")
    conn.commit()
    assert purge_old_data(conn, 30) == 2
    assert conn.execute("SELECT count(*) FROM position").fetchone() == (1,)
