"""SQL da API."""

# Colunas expostas por avião: estado live + enriquecimento (aircraft) + rota (flight_route)
_AIRCRAFT_COLUMNS = """
    l.hex, l.callsign, l.lat, l.lon, l.altitude_ft, l.on_ground, l.speed_kt, l.track_deg,
    l.vert_rate_fpm, l.squawk, COALESCE(l.category, a.category) AS category, l.rssi_dbfs,
    l.mlat, l.seen_at, l.pos_at,
    a.registration, a.icao_type, a.type_name, a.manufacturer, a.operator, a.country,
    a.photo_url, a.photo_credit, a.photo_link,
    r.airline_name, r.airline_icao, r.airline_iata,
    r.origin_icao, r.origin_iata, r.origin_name, r.origin_lat, r.origin_lon,
    r.dest_icao, r.dest_iata, r.dest_name, r.dest_lat, r.dest_lon
"""

_JOINS = """
FROM aircraft_live l
LEFT JOIN aircraft a ON a.hex = l.hex
LEFT JOIN flight_route r ON r.callsign = l.callsign AND r.status = 'ok'
"""

# Aviões com posição recente (o que aparece no mapa)
LIVE = f"""
SELECT {_AIRCRAFT_COLUMNS} {_JOINS}
WHERE l.lat IS NOT NULL AND l.pos_at > now() - make_interval(secs => %(max_age)s)
ORDER BY l.hex
"""

AIRCRAFT = """
SELECT a.hex, a.registration, a.icao_type, a.type_name, a.manufacturer, a.operator, a.country,
       a.category, a.photo_url, a.photo_credit, a.photo_link, a.enrich_status, a.enriched_at,
       a.first_seen, a.last_seen
FROM aircraft a WHERE a.hex = %(hex)s
"""

AIRCRAFT_LIVE = f"SELECT {_AIRCRAFT_COLUMNS} {_JOINS} WHERE l.hex = %(hex)s"

TRACK = """
SELECT ts, lat, lon, altitude_ft, speed_kt, track_deg, on_ground
FROM position
WHERE hex = %(hex)s AND ts > now() - make_interval(mins => %(minutes)s)
ORDER BY ts
"""
