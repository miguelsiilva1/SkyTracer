import json

import pytest
from fastapi.testclient import TestClient

from skytracer.config import settings

pytestmark = pytest.mark.db


@pytest.fixture
def client(conn, db_url, monkeypatch):
    monkeypatch.setattr(settings, "database_url", db_url)
    monkeypatch.setattr(settings, "ws_interval_seconds", 0.05)
    from skytracer.api.main import app

    conn.execute("""
        INSERT INTO aircraft (hex, registration, icao_type, operator, photo_url, photo_credit,
                              enrich_status, enriched_at)
        VALUES ('4d00f1', 'LX-LBR', 'B737', 'Luxair', 'https://t/1.jpg', 'Tomas', 'ok', now()),
               ('49004b', NULL, NULL, NULL, NULL, NULL, NULL, NULL)""")
    conn.execute("""
        INSERT INTO flight_route (callsign, airline_name, origin_icao, dest_icao, status)
        VALUES ('LGL32PR', 'Luxair', 'LPPR', 'ELLX', 'ok')""")
    conn.execute("""
        INSERT INTO aircraft_live (hex, seen_at, pos_at, callsign, lat, lon, altitude_ft)
        VALUES ('4d00f1', now(), now(), 'LGL32PR', 41.37, -8.55, 13425),
               ('49004b', now(), NULL, NULL, NULL, NULL, NULL)""")
    conn.execute("""
        INSERT INTO position (hex, ts, lat, lon, altitude_ft) VALUES
            ('4d00f1', now() - interval '3 hours', 41.0, -8.0, 1000),
            ('4d00f1', now() - interval '10 minutes', 41.2, -8.4, 9000),
            ('4d00f1', now() - interval '5 minutes', 41.3, -8.5, 12000)""")
    conn.commit()
    with TestClient(app) as c:
        yield c


def test_live_includes_enrichment_and_route(client):
    rows = client.get("/aircraft/live").json()
    assert [r["hex"] for r in rows] == ["4d00f1"]  # sem posição não aparece no mapa
    r = rows[0]
    assert (r["registration"], r["operator"], r["photo_credit"]) == ("LX-LBR", "Luxair", "Tomas")
    assert (r["airline_name"], r["origin_icao"], r["dest_icao"]) == ("Luxair", "LPPR", "ELLX")


def test_aircraft_detail(client):
    body = client.get("/aircraft/4D00F1").json()
    assert body["registration"] == "LX-LBR"
    assert body["live"]["callsign"] == "LGL32PR"
    assert client.get("/aircraft/abcdef").status_code == 404
    assert client.get("/aircraft/xyz").status_code == 422


def test_track_is_ordered_and_limited_in_time(client):
    track = client.get("/aircraft/4d00f1/track", params={"minutes": 60}).json()
    assert [p["altitude_ft"] for p in track] == [9000, 12000]
    assert len(client.get("/aircraft/4d00f1/track", params={"minutes": 600}).json()) == 3


def test_ws_live_streams_updates(client, conn):
    with client.websocket_connect("/ws/live") as ws:
        first = json.loads(ws.receive_text())
        assert [a["hex"] for a in first["aircraft"]] == ["4d00f1"]
        conn.execute("UPDATE aircraft_live SET altitude_ft = 14000 WHERE hex = '4d00f1'")
        conn.commit()
        for _ in range(20):
            msg = json.loads(ws.receive_text())
            if msg["aircraft"][0]["altitude_ft"] == 14000:
                break
        else:
            pytest.fail("o WebSocket não enviou a atualização")
