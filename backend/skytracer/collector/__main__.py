"""Ciclo principal do collector.

    python -m skytracer.collector

Lê o aircraft.json a cada POLL_INTERVAL_SECONDS e guarda:
  - cada avião visto na tabela `aircraft` (upsert de last_seen)
  - a posição de cada avião no máximo a cada POSITION_MIN_INTERVAL_SECONDS
  - um resumo da leitura em `receiver_snapshot`
"""

from __future__ import annotations

import logging
import time
from datetime import datetime

import httpx
import psycopg

from skytracer.collector.dump1090 import Snapshot, parse_snapshot
from skytracer.config import settings

log = logging.getLogger("skytracer.collector")

UPSERT_AIRCRAFT = """
INSERT INTO aircraft (hex, first_seen, last_seen) VALUES (%s, %s, %s)
ON CONFLICT (hex) DO UPDATE SET last_seen = EXCLUDED.last_seen
"""

INSERT_POSITION = """
INSERT INTO position (hex, ts, callsign, lat, lon, altitude_ft, on_ground, speed_kt,
                      track_deg, vert_rate_fpm, squawk, rssi_dbfs, mlat)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
"""

INSERT_SNAPSHOT = """
INSERT INTO receiver_snapshot (ts, messages_total, aircraft_total, aircraft_with_pos)
VALUES (%s, %s, %s, %s) ON CONFLICT (ts) DO NOTHING
"""


def store(conn: psycopg.Connection, snap: Snapshot, last_saved: dict[str, datetime]) -> int:
    saved = 0
    with conn.cursor() as cur:
        for a in snap.aircraft:
            cur.execute(UPSERT_AIRCRAFT, (a.hex, a.ts, a.ts))
            if not a.has_position:
                continue
            prev = last_saved.get(a.hex)
            if prev and (a.ts - prev).total_seconds() < settings.position_min_interval_seconds:
                continue
            cur.execute(
                INSERT_POSITION,
                (a.hex, a.ts, a.callsign, a.lat, a.lon, a.altitude_ft, a.on_ground, a.speed_kt,
                 a.track_deg, a.vert_rate_fpm, a.squawk, a.rssi_dbfs, a.mlat),
            )
            last_saved[a.hex] = a.ts
            saved += 1
        cur.execute(
            INSERT_SNAPSHOT,
            (snap.now, snap.messages_total, len(snap.aircraft),
             sum(1 for a in snap.aircraft if a.has_position)),
        )
    conn.commit()
    return saved


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    log.info("A ler %s a cada %ss", settings.dump1090_url, settings.poll_interval_seconds)
    last_saved: dict[str, datetime] = {}

    with httpx.Client(timeout=5.0) as http, psycopg.connect(settings.database_url) as conn:
        while True:
            started = time.monotonic()
            try:
                resp = http.get(settings.dump1090_url)
                resp.raise_for_status()
                snap = parse_snapshot(resp.json())
                saved = store(conn, snap, last_saved)
                log.info("%d aviões, %d posições guardadas", len(snap.aircraft), saved)
            except (httpx.HTTPError, ValueError) as exc:
                log.warning("Falha a ler o dump1090: %s", exc)
            except psycopg.Error as exc:
                log.error("Erro na base de dados: %s", exc)
                conn.rollback()
            time.sleep(max(0.0, settings.poll_interval_seconds - (time.monotonic() - started)))


if __name__ == "__main__":
    main()
