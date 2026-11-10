"""Ciclo principal do collector.

    python -m skytracer.collector

Lê o aircraft.json a cada POLL_INTERVAL_SECONDS e guarda:
  - o estado atual de cada avião em `aircraft_live` (a cada leitura, base do tempo real)
  - cada avião visto na tabela `aircraft` (upsert de last_seen e categoria)
  - a posição de cada avião no máximo a cada POSITION_MIN_INTERVAL_SECONDS, só se for
    recente e diferente da última guardada
  - um resumo da leitura em `receiver_snapshot` a cada SNAPSHOT_INTERVAL_SECONDS
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from datetime import datetime

import httpx
import psycopg

from skytracer.collector.dump1090 import Snapshot, parse_snapshot
from skytracer.config import settings
from skytracer.db.migrate import migrate

log = logging.getLogger("skytracer.collector")

UPSERT_AIRCRAFT = """
INSERT INTO aircraft (hex, first_seen, last_seen, category) VALUES (%s, %s, %s, %s)
ON CONFLICT (hex) DO UPDATE
   SET last_seen = GREATEST(aircraft.last_seen, EXCLUDED.last_seen),
       category  = COALESCE(EXCLUDED.category, aircraft.category)
"""

UPSERT_LIVE = """
INSERT INTO aircraft_live (hex, seen_at, pos_at, callsign, lat, lon, altitude_ft, on_ground,
                           speed_kt, track_deg, vert_rate_fpm, squawk, category, rssi_dbfs, mlat)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (hex) DO UPDATE SET
    seen_at = EXCLUDED.seen_at, pos_at = EXCLUDED.pos_at,
    callsign = COALESCE(EXCLUDED.callsign, aircraft_live.callsign),
    lat = EXCLUDED.lat, lon = EXCLUDED.lon, altitude_ft = EXCLUDED.altitude_ft,
    on_ground = EXCLUDED.on_ground, speed_kt = EXCLUDED.speed_kt,
    track_deg = EXCLUDED.track_deg, vert_rate_fpm = EXCLUDED.vert_rate_fpm,
    squawk = EXCLUDED.squawk, category = COALESCE(EXCLUDED.category, aircraft_live.category),
    rssi_dbfs = EXCLUDED.rssi_dbfs, mlat = EXCLUDED.mlat
"""

EXPIRE_LIVE = "DELETE FROM aircraft_live WHERE seen_at < %s - make_interval(secs => %s)"

INSERT_POSITION = """
INSERT INTO position (hex, ts, callsign, lat, lon, altitude_ft, on_ground, speed_kt,
                      track_deg, vert_rate_fpm, squawk, rssi_dbfs, mlat)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
"""

INSERT_SNAPSHOT = """
INSERT INTO receiver_snapshot (ts, messages_total, aircraft_total, aircraft_with_pos)
VALUES (%s, %s, %s, %s) ON CONFLICT (ts) DO NOTHING
"""


@dataclass
class CollectorState:
    """Estado em memória entre leituras (para respeitar os intervalos mínimos)."""

    last_position: dict[str, datetime] = field(default_factory=dict)
    last_snapshot: datetime | None = None


def should_store_position(prev: datetime | None, pos_ts: datetime) -> bool:
    if prev is None:
        return True
    return (pos_ts - prev).total_seconds() >= settings.position_min_interval_seconds


def store(conn: psycopg.Connection, snap: Snapshot, state: CollectorState) -> int:
    """Grava uma leitura. Devolve o número de posições inseridas em `position`."""
    positions = []
    for a in snap.aircraft:
        if a.has_fresh_position and should_store_position(state.last_position.get(a.hex), a.pos_ts):
            positions.append(a)

    with conn.cursor() as cur:
        cur.executemany(UPSERT_AIRCRAFT, [(a.hex, a.ts, a.ts, a.category) for a in snap.aircraft])
        cur.executemany(
            UPSERT_LIVE,
            [(a.hex, a.ts, a.pos_ts, a.callsign, a.lat, a.lon, a.altitude_ft, a.on_ground,
              a.speed_kt, a.track_deg, a.vert_rate_fpm, a.squawk, a.category, a.rssi_dbfs, a.mlat)
             for a in snap.aircraft],
        )
        cur.execute(EXPIRE_LIVE, (snap.now, settings.live_expiry_seconds))
        cur.executemany(
            INSERT_POSITION,
            [(a.hex, a.pos_ts, a.callsign, a.lat, a.lon, a.altitude_ft, a.on_ground, a.speed_kt,
              a.track_deg, a.vert_rate_fpm, a.squawk, a.rssi_dbfs, a.mlat) for a in positions],
        )
        if (
            state.last_snapshot is None
            or (snap.now - state.last_snapshot).total_seconds() >= settings.snapshot_interval_seconds
        ):
            cur.execute(
                INSERT_SNAPSHOT,
                (snap.now, snap.messages_total, len(snap.aircraft),
                 sum(1 for a in snap.aircraft if a.has_fresh_position)),
            )
            state.last_snapshot = snap.now
    conn.commit()
    # só depois do commit, para não "saltar" posições se a transação falhar
    for a in positions:
        state.last_position[a.hex] = a.pos_ts
    return len(positions)


def run(http: httpx.Client, conn: psycopg.Connection, state: CollectorState) -> None:
    while True:
        started = time.monotonic()
        try:
            resp = http.get(settings.dump1090_url)
            resp.raise_for_status()
            snap = parse_snapshot(resp.json())
            saved = store(conn, snap, state)
            log.debug("%d aviões, %d posições guardadas", len(snap.aircraft), saved)
        except (httpx.HTTPError, ValueError) as exc:
            log.warning("Falha a ler o dump1090: %s", exc)
        except psycopg.OperationalError:
            raise
        except psycopg.Error as exc:
            log.error("Erro na base de dados: %s", exc)
            conn.rollback()
        time.sleep(max(0.0, settings.poll_interval_seconds - (time.monotonic() - started)))


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)  # sem uma linha por pedido
    migrate()
    log.info("A ler %s a cada %ss", settings.dump1090_url, settings.poll_interval_seconds)
    state = CollectorState()
    with httpx.Client(timeout=5.0, headers={"User-Agent": settings.http_user_agent}) as http:
        while True:  # reconecta à BD se a ligação cair
            try:
                with psycopg.connect(settings.database_url) as conn:
                    run(http, conn, state)
            except psycopg.OperationalError as exc:
                log.error("Ligação à BD perdida (%s); nova tentativa em 5 s", exc)
                time.sleep(5)


if __name__ == "__main__":
    main()
