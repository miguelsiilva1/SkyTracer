"""adsbdb.com — dados da aeronave (por hex) e rota (por callsign). Gratuito, sem chave."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from skytracer.enrichment.http import RateLimitedClient


@dataclass(frozen=True, slots=True)
class AircraftInfo:
    registration: str | None
    icao_type: str | None
    type_name: str | None
    manufacturer: str | None
    operator: str | None
    country: str | None


@dataclass(frozen=True, slots=True)
class Airport:
    icao: str | None
    iata: str | None
    name: str | None
    lat: float | None
    lon: float | None


@dataclass(frozen=True, slots=True)
class RouteInfo:
    airline_name: str | None
    airline_icao: str | None
    airline_iata: str | None
    origin: Airport
    dest: Airport


def _response(payload: Any, key: str) -> dict[str, Any] | None:
    resp = payload.get("response") if isinstance(payload, dict) else None
    data = resp.get(key) if isinstance(resp, dict) else None  # 404 traz uma string
    return data if isinstance(data, dict) else None


def parse_aircraft(payload: Any) -> AircraftInfo | None:
    a = _response(payload, "aircraft")
    if a is None:
        return None
    return AircraftInfo(
        registration=a.get("registration"),
        icao_type=a.get("icao_type"),
        type_name=a.get("type"),
        manufacturer=a.get("manufacturer"),
        operator=a.get("registered_owner"),
        country=a.get("registered_owner_country_name"),
    )


def _airport(d: Any) -> Airport:
    d = d if isinstance(d, dict) else {}
    return Airport(
        icao=d.get("icao_code"),
        iata=d.get("iata_code"),
        name=d.get("name"),
        lat=d.get("latitude"),
        lon=d.get("longitude"),
    )


def parse_route(payload: Any) -> RouteInfo | None:
    r = _response(payload, "flightroute")
    if r is None:
        return None
    airline = r.get("airline") if isinstance(r.get("airline"), dict) else {}
    return RouteInfo(
        airline_name=airline.get("name"),
        airline_icao=airline.get("icao"),
        airline_iata=airline.get("iata"),
        origin=_airport(r.get("origin")),
        dest=_airport(r.get("destination")),
    )


def fetch_aircraft(client: RateLimitedClient, base_url: str, hex_: str) -> AircraftInfo | None:
    payload = client.get_json(f"{base_url}/aircraft/{hex_}")
    return parse_aircraft(payload) if payload is not None else None


def fetch_route(client: RateLimitedClient, base_url: str, callsign: str) -> RouteInfo | None:
    payload = client.get_json(f"{base_url}/callsign/{callsign}")
    return parse_route(payload) if payload is not None else None
