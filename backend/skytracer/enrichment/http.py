"""Cliente HTTP para APIs externas: limite de pedidos, retry e backoff exponencial."""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from typing import Any

import httpx

log = logging.getLogger("skytracer.enrichment")

RETRY_STATUS = {429, 500, 502, 503, 504}


class EnrichmentError(Exception):
    """A API externa falhou depois de todas as tentativas."""


class RateLimitedClient:
    """Faz no máximo `requests_per_second` pedidos por segundo a uma API.

    - 404 → devolve None (o recurso não existe; o chamador guarda cache negativa)
    - 429 / 5xx / erro de rede → espera (Retry-After ou backoff exponencial) e tenta de novo
    """

    def __init__(
        self,
        client: httpx.Client,
        requests_per_second: float = 1.0,
        max_retries: int = 4,
        backoff_base: float = 1.0,
        backoff_max: float = 60.0,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._client = client
        self._min_interval = 1.0 / requests_per_second
        self._max_retries = max_retries
        self._backoff_base = backoff_base
        self._backoff_max = backoff_max
        self._sleep = sleep
        self._clock = clock
        self._next_allowed = 0.0

    def _throttle(self) -> None:
        wait = self._next_allowed - self._clock()
        if wait > 0:
            self._sleep(wait)
        self._next_allowed = self._clock() + self._min_interval

    def _backoff(self, attempt: int, resp: httpx.Response | None) -> float:
        if resp is not None:
            retry_after = resp.headers.get("Retry-After", "")
            if retry_after.isdigit():
                return min(float(retry_after), self._backoff_max)
        return min(self._backoff_base * 2**attempt, self._backoff_max)

    def get_json(self, url: str) -> Any | None:
        for attempt in range(self._max_retries + 1):
            self._throttle()
            resp: httpx.Response | None = None
            try:
                resp = self._client.get(url)
                if resp.status_code == 404:
                    return None
                if resp.status_code not in RETRY_STATUS:
                    resp.raise_for_status()
                    return resp.json()
                reason = f"HTTP {resp.status_code}"
            except httpx.TransportError as exc:
                reason = str(exc) or type(exc).__name__
            except (httpx.HTTPStatusError, ValueError) as exc:
                raise EnrichmentError(f"{url}: {exc}") from exc
            if attempt == self._max_retries:
                break
            delay = self._backoff(attempt, resp)
            log.warning("%s falhou (%s); nova tentativa em %.1fs", url, reason, delay)
            self._sleep(delay)
        raise EnrichmentError(f"{url}: falhou após {self._max_retries + 1} tentativas")
