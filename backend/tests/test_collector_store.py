import pytest

from skytracer.collector.__main__ import CollectorState, store
from skytracer.collector.dump1090 import parse_snapshot
from skytracer.db.migrate import migrate

pytestmark = pytest.mark.db


def snapshot(now: float, *aircraft: dict, messages: int = 100):
    return parse_snapshot({"now": now, "messages": messages, "aircraft": list(aircraft)})


def plane(seen_pos: float = 0.0, **extra) -> dict:
    return {"hex": "4d00f1", "flight": "LGL32PR ", "lat": 41.37, "lon": -8.55, "altitude": 13425,
            "speed": 373, "track": 0, "category": "A3", "seen": 0.0, "seen_pos": seen_pos,
            "rssi": -17.2, "mlat": [], **extra}


def count(conn, table: str) -> int:
    return conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0]


def test_migrations_are_idempotent(db_url):
    assert migrate(db_url) == []


def test_store_writes_all_tables(conn):
    state = CollectorState()
    ground = {"hex": "49004b", "altitude": "ground", "seen": 23.6}
    assert store(conn, snapshot(1000, plane(), ground), state) == 1

    assert count(conn, "aircraft") == 2
    assert count(conn, "aircraft_live") == 2
    assert count(conn, "position") == 1
    assert count(conn, "receiver_snapshot") == 1
    assert conn.execute("SELECT category FROM aircraft WHERE hex='4d00f1'").fetchone() == ("A3",)
    row = conn.execute("SELECT callsign, on_ground FROM aircraft_live WHERE hex='49004b'").fetchone()
    assert row == (None, True)


def test_position_respects_min_interval_and_dedup(conn):
    state = CollectorState()
    store(conn, snapshot(1000, plane()), state)
    store(conn, snapshot(1001, plane()), state)               # 1 s depois: ignorada
    store(conn, snapshot(1006, plane(seen_pos=5.0)), state)   # mesma posição antiga: ignorada
    store(conn, snapshot(1006, plane()), state)               # 6 s depois: guardada
    assert count(conn, "position") == 2
    # o estado live é sempre atualizado
    assert conn.execute("SELECT extract(epoch FROM seen_at) FROM aircraft_live").fetchone()[0] == 1006


def test_stale_position_not_stored(conn):
    store(conn, snapshot(1000, plane(seen_pos=63.1)), CollectorState())
    assert count(conn, "position") == 0
    assert count(conn, "aircraft_live") == 1


def test_snapshot_every_interval_and_live_expiry(conn):
    state = CollectorState()
    for t in range(1000, 1012):
        store(conn, snapshot(t, plane()), state)
    assert count(conn, "receiver_snapshot") == 2  # t=1000 e t=1010

    other = {"hex": "3949ea", "seen": 0.0}
    store(conn, snapshot(1400, other), state)  # 4d00f1 visto há >300 s
    assert [r[0] for r in conn.execute("SELECT hex FROM aircraft_live")] == ["3949ea"]
