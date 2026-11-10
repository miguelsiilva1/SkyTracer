"""API REST do SkyTracer (esqueleto do Sprint 0).

    uvicorn skytracer.api.main:app --reload
"""

from __future__ import annotations

import psycopg
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from psycopg.rows import dict_row

from skytracer.config import settings

app = FastAPI(title="SkyTracer API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.api_cors_origins.split(",") if o.strip()],
    allow_methods=["GET"],
    allow_headers=["*"],
)

LIVE_QUERY = """
SELECT DISTINCT ON (p.hex)
       p.hex, p.callsign, p.lat, p.lon, p.altitude_ft, p.on_ground,
       p.speed_kt, p.track_deg, p.squawk, p.ts
FROM position p
WHERE p.ts > now() - make_interval(secs => %s)
ORDER BY p.hex, p.ts DESC
"""


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/aircraft/live")
def live_aircraft(max_age_seconds: int = 60) -> list[dict]:
    """Última posição conhecida de cada avião visto nos últimos `max_age_seconds`."""
    with psycopg.connect(settings.database_url, row_factory=dict_row) as conn:
        return conn.execute(LIVE_QUERY, (max_age_seconds,)).fetchall()
