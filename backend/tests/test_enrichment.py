import json
from pathlib import Path

import httpx
import pytest

from skytracer.enrichment import adsbdb, planespotters
from skytracer.enrichment.http import EnrichmentError, RateLimitedClient

FIXTURES = Path(__file__).parent / "fixtures"


def load(name: str):
    return json.loads((FIXTURES / name).read_text())


class FakeTime:
    def __init__(self) -> None:
        self.now = 0.0
        self.sleeps: list[float] = []

    def sleep(self, s: float) -> None:
        self.sleeps.append(s)
        self.now += s

    def clock(self) -> float:
        return self.now


def make_client(handler, rps: float = 1.0, **kw) -> tuple[RateLimitedClient, FakeTime]:
    t = FakeTime()
    http = httpx.Client(transport=httpx.MockTransport(handler))
    return RateLimitedClient(http, rps, sleep=t.sleep, clock=t.clock, **kw), t


# --- parsers ---------------------------------------------------------------------------

def test_parse_adsbdb_aircraft():
    info = adsbdb.parse_aircraft(load("adsbdb_aircraft.json"))
    assert info == adsbdb.AircraftInfo(
        registration="LX-LBR", icao_type="B737", type_name="737NG 7K2/W",
        manufacturer="Boeing", operator="Luxair", country="Luxembourg")


def test_parse_adsbdb_route():
    route = adsbdb.parse_route(load("adsbdb_callsign.json"))
    assert (route.airline_name, route.airline_icao, route.airline_iata) == ("Luxair", "LGL", "LG")
    assert (route.origin.icao, route.origin.iata) == ("LPPR", "OPO")
    assert route.dest.icao == "ELLX" and route.dest.lat == pytest.approx(49.62333)


def test_parse_adsbdb_unknown():
    assert adsbdb.parse_aircraft({"response": "unknown aircraft"}) is None
    assert adsbdb.parse_route({"response": "unknown callsign"}) is None


def test_parse_planespotters():
    photo = planespotters.parse_photo(load("planespotters_photos.json"))
    assert photo.url.endswith("_280.jpg")
    assert photo.photographer == "Tomas Scheffer"
    assert photo.link.startswith("https://www.planespotters.net/photo/")
    assert planespotters.parse_photo({"photos": []}) is None


# --- cliente HTTP ----------------------------------------------------------------------

def test_404_returns_none():
    client, _ = make_client(lambda req: httpx.Response(404, json={"response": "unknown"}))
    assert adsbdb.fetch_aircraft(client, "https://x", "000000") is None


def test_retries_with_exponential_backoff():
    calls = []

    def handler(req):
        calls.append(req)
        return httpx.Response(503) if len(calls) < 3 else httpx.Response(200, json={"ok": 1})

    client, t = make_client(handler, rps=1000)
    assert client.get_json("https://x/a") == {"ok": 1}
    assert len(calls) == 3
    backoffs = [s for s in t.sleeps if s >= 0.5]
    assert backoffs == [1.0, 2.0]


def test_respects_retry_after():
    responses = iter([httpx.Response(429, headers={"Retry-After": "7"}),
                      httpx.Response(200, json={})])
    client, t = make_client(lambda req: next(responses), rps=1000)
    client.get_json("https://x")
    assert 7.0 in t.sleeps


def test_transport_errors_are_retried_then_raise():
    def handler(req):
        raise httpx.ConnectTimeout("timeout")

    client, _ = make_client(handler, rps=1000, max_retries=2)
    with pytest.raises(EnrichmentError):
        client.get_json("https://x")


def test_client_errors_are_not_retried():
    calls = []

    def handler(req):
        calls.append(req)
        return httpx.Response(400)

    client, _ = make_client(handler)
    with pytest.raises(EnrichmentError):
        client.get_json("https://x")
    assert len(calls) == 1


def test_rate_limit_spaces_requests():
    client, t = make_client(lambda req: httpx.Response(200, json={}), rps=2.0)
    for _ in range(3):
        client.get_json("https://x")
    assert t.sleeps == [0.5, 0.5]
