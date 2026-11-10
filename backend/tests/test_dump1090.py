import json
from pathlib import Path

from skytracer.collector.dump1090 import parse_snapshot

FIXTURES = Path(__file__).parent / "fixtures"

MUTABILITY_SAMPLE = {
    "now": 1762766460.0,
    "messages": 123456,
    "aircraft": [
        {
            "hex": "4951C6", "squawk": "5312", "flight": "TAP1942 ",
            "lat": 41.32, "lon": -8.51, "altitude": 24000, "vert_rate": -1200,
            "track": 187, "speed": 412, "mlat": [], "messages": 800, "seen": 0.5, "rssi": -18.2,
        },
        {"hex": "3c6589", "altitude": "ground", "seen": 3},       # sem posição, no solo
        {"hex": "~abc123", "lat": 41.0, "lon": -8.0},             # TIS-B, ignorado
    ],
}

FA_SAMPLE = {
    "now": 1762766460.0,
    "aircraft": [{"hex": "4ca7b1", "flight": "RYR82KQ", "lat": 41.1, "lon": -8.6,
                  "alt_baro": 3500, "gs": 180.4, "baro_rate": 640, "mlat": ["lat", "lon"]}],
}


def test_mutability_fields_are_normalized():
    snap = parse_snapshot(MUTABILITY_SAMPLE)
    assert snap.messages_total == 123456
    assert len(snap.aircraft) == 2

    tap = snap.aircraft[0]
    assert tap.hex == "4951c6"
    assert tap.callsign == "TAP1942"
    assert tap.altitude_ft == 24000
    assert tap.speed_kt == 412
    assert tap.vert_rate_fpm == -1200
    assert tap.has_position and not tap.mlat
    assert tap.ts.timestamp() == 1762766459.5
    assert tap.pos_ts == tap.ts  # sem seen_pos usa seen
    assert tap.has_fresh_position


def test_ground_and_missing_position():
    ground = parse_snapshot(MUTABILITY_SAMPLE).aircraft[1]
    assert ground.on_ground and ground.altitude_ft is None
    assert not ground.has_position


def test_fa_fields_are_normalized():
    a = parse_snapshot(FA_SAMPLE).aircraft[0]
    assert (a.altitude_ft, a.speed_kt, a.vert_rate_fpm) == (3500, 180.4, 640)
    assert a.mlat


def test_position_timestamp_uses_seen_pos():
    payload = {
        "now": 1000.0,
        "aircraft": [{"hex": "4868e2", "lat": 42.1, "lon": -8.5, "seen": 20.7, "seen_pos": 54.8,
                      "category": "A3", "nucp": 7}],
    }
    a = parse_snapshot(payload).aircraft[0]
    assert a.ts.timestamp() == 1000.0 - 20.7
    assert a.pos_ts.timestamp() == 1000.0 - 54.8
    assert a.has_fresh_position
    assert (a.category, a.nucp) == ("A3", 7)


def test_stale_position_is_not_fresh():
    payload = {"now": 1000.0,
               "aircraft": [{"hex": "3c7984", "lat": 42.2, "lon": -6.8, "seen": 26, "seen_pos": 63.1}]}
    a = parse_snapshot(payload).aircraft[0]
    assert a.has_position and not a.has_fresh_position


def test_real_receiver_sample():
    """Amostra real do dump1090 do professor (dump1090-mutability)."""
    payload = json.loads((FIXTURES / "aircraft_mutability.json").read_text())
    snap = parse_snapshot(payload)
    assert len(snap.aircraft) == len(payload["aircraft"])
    by_hex = {a.hex: a for a in snap.aircraft}

    ground = by_hex["49004b"]
    assert ground.on_ground and ground.altitude_ft is None and not ground.has_position

    stale = by_hex["3c7984"]
    assert stale.has_position and not stale.has_fresh_position

    fresh = [a for a in snap.aircraft if a.has_fresh_position]
    # recetor no Porto: tudo o que vê fica no noroeste da Península Ibérica
    assert fresh and all(36 < a.lat < 45 and -15 < a.lon < -2 for a in fresh)
    assert all(a.callsign is None or a.callsign == a.callsign.strip() for a in snap.aircraft)
