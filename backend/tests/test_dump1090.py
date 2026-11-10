from skytracer.collector.dump1090 import parse_snapshot

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


def test_ground_and_missing_position():
    ground = parse_snapshot(MUTABILITY_SAMPLE).aircraft[1]
    assert ground.on_ground and ground.altitude_ft is None
    assert not ground.has_position


def test_fa_fields_are_normalized():
    a = parse_snapshot(FA_SAMPLE).aircraft[0]
    assert (a.altitude_ft, a.speed_kt, a.vert_rate_fpm) == (3500, 180.4, 640)
    assert a.mlat
