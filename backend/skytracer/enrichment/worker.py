"""Worker de enriquecimento: preenche `aircraft` e `flight_route` a partir das APIs externas.

Só enriquece aviões que o recetor está a ver (`aircraft_live`). Os resultados ficam em cache
na BD (TTL configurável); "não encontrado" também fica em cache para não repetir pedidos, e
os erros são repetidos ao fim de uma hora.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import psycopg

from skytracer.config import settings
from skytracer.enrichment import adsbdb, planespotters
from skytracer.enrichment.http import EnrichmentError, RateLimitedClient

log = logging.getLogger("skytracer.enrichment")

ERROR_RETRY = "interval '1 hour'"

AIRCRAFT_TODO = f"""
SELECT a.hex FROM aircraft a JOIN aircraft_live l USING (hex)
WHERE a.enriched_at IS NULL
   OR a.enriched_at < now() - CASE WHEN a.enrich_status = 'error' THEN {ERROR_RETRY}
                                   ELSE make_interval(days => %(ttl)s) END
ORDER BY a.enriched_at NULLS FIRST, l.seen_at DESC
LIMIT %(limit)s
"""

ROUTES_TODO = f"""
SELECT DISTINCT l.callsign FROM aircraft_live l
LEFT JOIN flight_route r ON r.callsign = l.callsign
WHERE l.callsign IS NOT NULL
  AND (r.callsign IS NULL
       OR r.fetched_at < now() - CASE WHEN r.status = 'error' THEN {ERROR_RETRY}
                                      ELSE make_interval(days => %(ttl)s) END)
LIMIT %(limit)s
"""

UPDATE_AIRCRAFT = """
UPDATE aircraft SET
    registration = COALESCE(%(registration)s, registration),
    icao_type    = COALESCE(%(icao_type)s, icao_type),
    type_name    = COALESCE(%(type_name)s, type_name),
    manufacturer = COALESCE(%(manufacturer)s, manufacturer),
    operator     = COALESCE(%(operator)s, operator),
    country      = COALESCE(%(country)s, country),
    photo_url    = COALESCE(%(photo_url)s, photo_url),
    photo_credit = COALESCE(%(photo_credit)s, photo_credit),
    photo_link   = COALESCE(%(photo_link)s, photo_link),
    enrich_status = %(status)s,
    enriched_at  = now()
WHERE hex = %(hex)s
"""

UPSERT_ROUTE = """
INSERT INTO flight_route (callsign, airline_name, airline_icao, airline_iata,
    origin_icao, origin_iata, origin_name, origin_lat, origin_lon,
    dest_icao, dest_iata, dest_name, dest_lat, dest_lon, status, fetched_at)
VALUES (%(callsign)s, %(airline_name)s, %(airline_icao)s, %(airline_iata)s,
    %(origin_icao)s, %(origin_iata)s, %(origin_name)s, %(origin_lat)s, %(origin_lon)s,
    %(dest_icao)s, %(dest_iata)s, %(dest_name)s, %(dest_lat)s, %(dest_lon)s, %(status)s, now())
ON CONFLICT (callsign) DO UPDATE SET
    airline_name = EXCLUDED.airline_name, airline_icao = EXCLUDED.airline_icao,
    airline_iata = EXCLUDED.airline_iata,
    origin_icao = EXCLUDED.origin_icao, origin_iata = EXCLUDED.origin_iata,
    origin_name = EXCLUDED.origin_name, origin_lat = EXCLUDED.origin_lat,
    origin_lon = EXCLUDED.origin_lon,
    dest_icao = EXCLUDED.dest_icao, dest_iata = EXCLUDED.dest_iata,
    dest_name = EXCLUDED.dest_name, dest_lat = EXCLUDED.dest_lat, dest_lon = EXCLUDED.dest_lon,
    status = EXCLUDED.status, fetched_at = now()
"""

ROUTE_FIELDS = ("airline_name", "airline_icao", "airline_iata", "origin_icao", "origin_iata",
                "origin_name", "origin_lat", "origin_lon", "dest_icao", "dest_iata",
                "dest_name", "dest_lat", "dest_lon")

PURGE = [
    "DELETE FROM position WHERE ts < now() - make_interval(days => %s)",
    "DELETE FROM receiver_snapshot WHERE ts < now() - make_interval(days => %s)",
]


@dataclass
class Clients:
    adsbdb: RateLimitedClient
    planespotters: RateLimitedClient


def enrich_aircraft(conn: psycopg.Connection, clients: Clients, hex_: str) -> str:
    """Enriquece um avião e devolve o estado gravado ('ok', 'not_found' ou 'error')."""
    row = {"hex": hex_, "registration": None, "icao_type": None, "type_name": None,
           "manufacturer": None, "operator": None, "country": None,
           "photo_url": None, "photo_credit": None, "photo_link": None}
    try:
        info = adsbdb.fetch_aircraft(clients.adsbdb, settings.adsbdb_url, hex_)
        photo = planespotters.fetch_photo(clients.planespotters, settings.planespotters_url, hex_)
    except EnrichmentError as exc:
        log.warning("Enriquecimento de %s falhou: %s", hex_, exc)
        row["status"] = "error"
    else:
        if info:
            row.update(registration=info.registration, icao_type=info.icao_type,
                       type_name=info.type_name, manufacturer=info.manufacturer,
                       operator=info.operator, country=info.country)
        if photo:
            row.update(photo_url=photo.url, photo_credit=photo.photographer,
                       photo_link=photo.link)
        row["status"] = "ok" if info or photo else "not_found"
    conn.execute(UPDATE_AIRCRAFT, row)
    conn.commit()
    return row["status"]


def enrich_route(conn: psycopg.Connection, clients: Clients, callsign: str) -> str:
    row: dict = {"callsign": callsign, **dict.fromkeys(ROUTE_FIELDS)}
    try:
        route = adsbdb.fetch_route(clients.adsbdb, settings.adsbdb_url, callsign)
    except EnrichmentError as exc:
        log.warning("Rota de %s falhou: %s", callsign, exc)
        row["status"] = "error"
    else:
        if route:
            row.update(
                airline_name=route.airline_name, airline_icao=route.airline_icao,
                airline_iata=route.airline_iata,
                origin_icao=route.origin.icao, origin_iata=route.origin.iata,
                origin_name=route.origin.name, origin_lat=route.origin.lat,
                origin_lon=route.origin.lon,
                dest_icao=route.dest.icao, dest_iata=route.dest.iata,
                dest_name=route.dest.name, dest_lat=route.dest.lat, dest_lon=route.dest.lon,
            )
        row["status"] = "ok" if route else "not_found"
    conn.execute(UPSERT_ROUTE, row)
    conn.commit()
    return row["status"]


def run_once(conn: psycopg.Connection, clients: Clients, limit: int = 20) -> tuple[int, int]:
    """Uma passagem do worker. Devolve (aviões, rotas) processados."""
    hexes = [r[0] for r in conn.execute(
        AIRCRAFT_TODO, {"ttl": settings.aircraft_ttl_days, "limit": limit})]
    callsigns = [r[0] for r in conn.execute(
        ROUTES_TODO, {"ttl": settings.route_ttl_days, "limit": limit})]
    conn.commit()
    for h in hexes:
        enrich_aircraft(conn, clients, h)
    for cs in callsigns:
        enrich_route(conn, clients, cs)
    return len(hexes), len(callsigns)


def purge_old_data(conn: psycopg.Connection, days: int) -> int:
    """Política de retenção: apaga posições e snapshots com mais de `days` dias."""
    deleted = 0
    for sql in PURGE:
        deleted += conn.execute(sql, (days,)).rowcount
    conn.commit()
    return deleted
