"""API REST + WebSocket do SkyTracer.

    uvicorn skytracer.api.main:app --reload

Serve sempre a partir da BD local, por isso continua a responder (último estado e histórico)
mesmo que o dump1090 do professor falhe.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import FastAPI, HTTPException, Path, Query, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from skytracer.api import queries
from skytracer.config import settings

log = logging.getLogger("skytracer.api")

Hex = Annotated[str, Path(pattern=r"^[0-9a-fA-F]{6}$")]
LIVE_MAX_AGE_S = 60


class LiveBroadcaster:
    """Um único ciclo lê `aircraft_live` a cada WS_INTERVAL_SECONDS e envia a todos os clientes."""

    def __init__(self, pool: AsyncConnectionPool) -> None:
        self.pool = pool
        self.clients: set[WebSocket] = set()
        self.latest: str | None = None

    async def fetch(self) -> str:
        async with self.pool.connection() as conn:
            cur = await conn.execute(queries.LIVE, {"max_age": LIVE_MAX_AGE_S})
            rows = await cur.fetchall()
        payload = {"ts": datetime.now(tz=UTC), "aircraft": rows}
        return json.dumps(jsonable_encoder(payload))

    async def run(self) -> None:
        while True:
            if self.clients:
                try:
                    self.latest = await self.fetch()
                    await asyncio.gather(*(self._send(ws, self.latest) for ws in list(self.clients)))
                except Exception:  # o ciclo não pode morrer
                    log.exception("Falha no broadcast do /ws/live")
            await asyncio.sleep(settings.ws_interval_seconds)

    async def _send(self, ws: WebSocket, message: str) -> None:
        try:
            await ws.send_text(message)
        except (WebSocketDisconnect, RuntimeError):  # cliente desligado
            self.clients.discard(ws)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    pool = AsyncConnectionPool(settings.database_url, open=False, kwargs={"row_factory": dict_row})
    await pool.open()
    app.state.pool = pool
    app.state.live = LiveBroadcaster(pool)
    task = asyncio.create_task(app.state.live.run())
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        await pool.close()


app = FastAPI(title="SkyTracer API", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.api_cors_origins.split(",") if o.strip()],
    allow_methods=["GET"],
    allow_headers=["*"],
)


async def fetch(sql: str, params: dict[str, Any]) -> list[dict]:
    async with app.state.pool.connection() as conn:
        cur = await conn.execute(sql, params)
        return await cur.fetchall()


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/aircraft/live")
async def live_aircraft(
    max_age_seconds: Annotated[int, Query(ge=1, le=300)] = LIVE_MAX_AGE_S,
) -> list[dict]:
    """Aviões com posição recente, já com dados de enriquecimento e rota."""
    return await fetch(queries.LIVE, {"max_age": max_age_seconds})


@app.get("/aircraft/{hex}")
async def aircraft_detail(hex: Hex) -> dict:
    """Dados do avião (enriquecimento) e o estado atual, se estiver a ser visto."""
    params = {"hex": hex.lower()}
    rows = await fetch(queries.AIRCRAFT, params)
    if not rows:
        raise HTTPException(404, "Avião desconhecido")
    live = await fetch(queries.AIRCRAFT_LIVE, params)
    return {**rows[0], "live": live[0] if live else None}


@app.get("/aircraft/{hex}/track")
async def aircraft_track(
    hex: Hex, minutes: Annotated[int, Query(ge=1, le=1440)] = 60
) -> list[dict]:
    """Rasto do avião (posições guardadas) nos últimos `minutes` minutos."""
    return await fetch(queries.TRACK, {"hex": hex.lower(), "minutes": minutes})


@app.websocket("/ws/live")
async def ws_live(ws: WebSocket) -> None:
    """Envia a cada ~1 s `{"ts": ..., "aircraft": [...]}` (mesmo formato do /aircraft/live)."""
    live: LiveBroadcaster = app.state.live
    await ws.accept()
    await ws.send_text(live.latest or await live.fetch())
    live.clients.add(ws)
    try:
        while True:  # mantém a ligação; mensagens do cliente são ignoradas
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        live.clients.discard(ws)
