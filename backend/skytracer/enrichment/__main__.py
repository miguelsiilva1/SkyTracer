"""Worker de enriquecimento + limpeza diária de retenção.

    python -m skytracer.enrichment
"""

from __future__ import annotations

import logging
import time

import httpx
import psycopg

from skytracer.config import settings
from skytracer.db.migrate import migrate
from skytracer.enrichment.http import RateLimitedClient
from skytracer.enrichment.worker import Clients, purge_old_data, run_once

log = logging.getLogger("skytracer.enrichment")

PURGE_EVERY_S = 24 * 3600


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)  # sem uma linha por pedido
    migrate()
    headers = {"User-Agent": settings.http_user_agent}
    rps = settings.enrich_requests_per_second
    last_purge: float | None = None
    with httpx.Client(timeout=10.0, headers=headers) as http:
        # um limitador por API: cada uma tem os seus próprios limites
        clients = Clients(adsbdb=RateLimitedClient(http, rps),
                          planespotters=RateLimitedClient(http, rps))
        while True:
            try:
                with psycopg.connect(settings.database_url) as conn:
                    while True:
                        if last_purge is None or time.monotonic() - last_purge >= PURGE_EVERY_S:
                            n = purge_old_data(conn, settings.retention_days)
                            log.info("Retenção (%d dias): %d linhas apagadas",
                                     settings.retention_days, n)
                            last_purge = time.monotonic()
                        planes, routes = run_once(conn, clients)
                        if planes or routes:
                            log.info("Enriquecidos: %d aviões, %d rotas", planes, routes)
                        time.sleep(settings.enrich_interval_seconds)
            except psycopg.Error as exc:
                log.error("Erro na BD (%s); nova tentativa em 5 s", exc)
                time.sleep(5)


if __name__ == "__main__":
    main()
