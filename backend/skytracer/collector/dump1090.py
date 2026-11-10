"""Leitura e normalização do aircraft.json do dump1090.

O recetor do professor corre dump1090-mutability, que usa nomes de campos antigos
(`altitude`, `speed`, `vert_rate`). Versões mais recentes (dump1090-fa / readsb) usam
`alt_baro`, `gs`, `baro_rate`. Este módulo aceita as duas e devolve sempre o mesmo formato.

Timestamps: `seen` é a idade da última mensagem e `seen_pos` a idade da última posição.
O dump1090 mantém aviões até ~300 s sem mensagens, por isso a hora da posição tem de vir de
`seen_pos` (senão a mesma posição antiga seria gravada várias vezes com horas diferentes).

Só usa a biblioteca padrão para ser fácil de testar.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

# Posições mais antigas do que isto não são consideradas atuais
MAX_POSITION_AGE_S = 60.0


@dataclass(frozen=True, slots=True)
class AircraftState:
    hex: str
    ts: datetime  # hora da última mensagem (now - seen)
    pos_ts: datetime | None  # hora da última posição (now - seen_pos)
    callsign: str | None
    lat: float | None
    lon: float | None
    altitude_ft: int | None
    on_ground: bool
    speed_kt: float | None
    track_deg: float | None
    vert_rate_fpm: int | None
    squawk: str | None
    rssi_dbfs: float | None
    mlat: bool
    seen_s: float | None
    seen_pos_s: float | None
    category: str | None
    nucp: int | None

    @property
    def has_position(self) -> bool:
        return self.lat is not None and self.lon is not None

    @property
    def has_fresh_position(self) -> bool:
        return (
            self.has_position
            and self.seen_pos_s is not None
            and self.seen_pos_s <= MAX_POSITION_AGE_S
        )


@dataclass(frozen=True, slots=True)
class Snapshot:
    now: datetime
    messages_total: int | None
    aircraft: list[AircraftState]


def _first(d: dict[str, Any], *keys: str) -> Any:
    for k in keys:
        if d.get(k) is not None:
            return d[k]
    return None


def _ago(now: datetime, seconds: Any) -> datetime | None:
    if not isinstance(seconds, (int, float)):
        return None
    return datetime.fromtimestamp(now.timestamp() - seconds, tz=UTC)


def parse_aircraft(raw: dict[str, Any], now: datetime) -> AircraftState | None:
    hex_ = (raw.get("hex") or "").strip().lower()
    # '~' indica endereço não-ICAO (TIS-B); ignoramos por agora
    if not hex_ or hex_.startswith("~") or len(hex_) != 6:
        return None

    alt = _first(raw, "alt_baro", "altitude")
    on_ground = alt == "ground"
    altitude_ft = int(alt) if isinstance(alt, (int, float)) else None

    callsign = (raw.get("flight") or "").strip() or None
    mlat_fields = raw.get("mlat") or []

    seen = raw.get("seen")
    seen_pos = raw.get("seen_pos")
    lat, lon = raw.get("lat"), raw.get("lon")
    # sem seen_pos assume-se que a posição é tão recente como a última mensagem
    if lat is not None and lon is not None and not isinstance(seen_pos, (int, float)):
        seen_pos = seen

    vr = _first(raw, "baro_rate", "vert_rate", "geom_rate")

    return AircraftState(
        hex=hex_,
        ts=_ago(now, seen) or now,
        pos_ts=_ago(now, seen_pos) if lat is not None and lon is not None else None,
        callsign=callsign,
        lat=lat,
        lon=lon,
        altitude_ft=altitude_ft,
        on_ground=on_ground,
        speed_kt=_first(raw, "gs", "speed"),
        track_deg=raw.get("track"),
        vert_rate_fpm=int(vr) if isinstance(vr, (int, float)) else None,
        squawk=raw.get("squawk"),
        rssi_dbfs=raw.get("rssi"),
        mlat="lat" in mlat_fields,
        seen_s=seen if isinstance(seen, (int, float)) else None,
        seen_pos_s=seen_pos if isinstance(seen_pos, (int, float)) else None,
        category=raw.get("category") or None,
        nucp=raw.get("nucp") if isinstance(raw.get("nucp"), int) else None,
    )


def parse_snapshot(payload: dict[str, Any]) -> Snapshot:
    now_raw = payload.get("now")
    now = (
        datetime.fromtimestamp(now_raw, tz=UTC)
        if isinstance(now_raw, (int, float))
        else datetime.now(tz=UTC)
    )
    aircraft = [
        a for raw in payload.get("aircraft", []) if (a := parse_aircraft(raw, now)) is not None
    ]
    return Snapshot(now=now, messages_total=payload.get("messages"), aircraft=aircraft)
