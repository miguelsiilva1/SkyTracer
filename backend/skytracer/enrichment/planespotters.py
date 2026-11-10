"""planespotters.net — fotos por hex.

Os termos da API exigem mostrar o nome do fotógrafo e um link para a página da foto,
e um User-Agent com contacto.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from skytracer.enrichment.http import RateLimitedClient


@dataclass(frozen=True, slots=True)
class Photo:
    url: str
    photographer: str | None
    link: str | None


def parse_photo(payload: Any) -> Photo | None:
    photos = payload.get("photos") if isinstance(payload, dict) else None
    if not photos:
        return None
    p = photos[0]
    thumb = p.get("thumbnail_large") or p.get("thumbnail") or {}
    if not thumb.get("src"):
        return None
    return Photo(url=thumb["src"], photographer=p.get("photographer"), link=p.get("link"))


def fetch_photo(client: RateLimitedClient, base_url: str, hex_: str) -> Photo | None:
    payload = client.get_json(f"{base_url}/hex/{hex_}")
    return parse_photo(payload) if payload is not None else None
