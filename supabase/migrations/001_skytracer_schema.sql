-- SkyTracer: history and enrichment cache (Supabase / PostgreSQL).
-- Written only by the backend with the secret key; RLS without policies blocks
-- every other client.

-- An aircraft, identified by its 24-bit ICAO address
create table public.aircraft (
    hex            text primary key,
    registration   text,
    icao_type      text,
    type_name      text,
    manufacturer   text,
    operator       text,
    country        text,
    category       text,
    photo_url      text,
    photo_credit   text,
    photo_link     text,
    enrich_status  text,          -- null = not enriched yet; 'ok' / 'not_found' / 'error'
    enriched_at    timestamptz,
    first_seen     timestamptz not null default now(),
    last_seen      timestamptz not null default now()
);

-- Route of a callsign (from adsbdb, cached)
create table public.flight_route (
    callsign      text primary key,
    airline_name  text,
    airline_icao  text,
    airline_iata  text,
    origin_icao   text,
    origin_iata   text,
    origin_name   text,
    origin_lat    double precision,
    origin_lon    double precision,
    dest_icao     text,
    dest_iata     text,
    dest_name     text,
    dest_lat      double precision,
    dest_lon      double precision,
    status        text not null default 'ok',
    fetched_at    timestamptz not null default now()
);

-- Position history (tracks, replay and coverage map)
create table public.position (
    hex            text not null references public.aircraft (hex) on delete cascade,
    ts             timestamptz not null,
    callsign       text,
    lat            double precision not null,
    lon            double precision not null,
    altitude_ft    integer,
    on_ground      boolean not null default false,
    speed_kt       real,
    track_deg      real,
    vert_rate_fpm  integer,
    squawk         text,
    rssi_dbfs      real,
    mlat           boolean not null default false
);

create index position_hex_ts_idx on public.position (hex, ts);
create index position_ts_brin on public.position using brin (ts);  -- small; serves the retention purge

-- Receiver statistics (messages, number of aircraft)
create table public.receiver_snapshot (
    ts                 timestamptz primary key,
    messages_total     bigint,
    aircraft_total     integer,
    aircraft_with_pos  integer
);

alter table public.aircraft enable row level security;
alter table public.flight_route enable row level security;
alter table public.position enable row level security;
alter table public.receiver_snapshot enable row level security;

-- One write per flush: aircraft seen, positions and receiver snapshots
create function public.record_batch(p_aircraft jsonb, p_positions jsonb, p_snapshots jsonb)
returns void
language sql
set search_path = ''
as $$
    insert into public.aircraft (hex, first_seen, last_seen, category)
    select a.hex, a.seen_at, a.seen_at, a.category
    from jsonb_to_recordset(p_aircraft) as a (hex text, seen_at timestamptz, category text)
    on conflict (hex) do update
       set last_seen = greatest(public.aircraft.last_seen, excluded.last_seen),
           category  = coalesce(excluded.category, public.aircraft.category);

    insert into public.position (hex, ts, callsign, lat, lon, altitude_ft, on_ground, speed_kt,
                                 track_deg, vert_rate_fpm, squawk, rssi_dbfs, mlat)
    select p.hex, p.ts, p.callsign, p.lat, p.lon, p.altitude_ft, p.on_ground, p.speed_kt,
           p.track_deg, p.vert_rate_fpm, p.squawk, p.rssi_dbfs, p.mlat
    from jsonb_to_recordset(p_positions) as p (
        hex text, ts timestamptz, callsign text, lat double precision, lon double precision,
        altitude_ft integer, on_ground boolean, speed_kt real, track_deg real,
        vert_rate_fpm integer, squawk text, rssi_dbfs real, mlat boolean)
    where exists (select 1 from public.aircraft a where a.hex = p.hex);

    insert into public.receiver_snapshot (ts, messages_total, aircraft_total, aircraft_with_pos)
    select s.ts, s.messages_total, s.aircraft_total, s.aircraft_with_pos
    from jsonb_to_recordset(p_snapshots) as s (
        ts timestamptz, messages_total bigint, aircraft_total integer, aircraft_with_pos integer)
    on conflict (ts) do nothing;
$$;

-- Result of an aircraft lookup; fields the lookup did not bring keep their previous value
create function public.save_aircraft_enrichment(p jsonb)
returns void
language sql
set search_path = ''
as $$
    insert into public.aircraft as a (hex, registration, icao_type, type_name, manufacturer,
        operator, country, photo_url, photo_credit, photo_link, enrich_status, enriched_at)
    select r.hex, r.registration, r.icao_type, r.type_name, r.manufacturer, r.operator,
           r.country, r.photo_url, r.photo_credit, r.photo_link, r.enrich_status, r.enriched_at
    from jsonb_to_record(p) as r (
        hex text, registration text, icao_type text, type_name text, manufacturer text,
        operator text, country text, photo_url text, photo_credit text, photo_link text,
        enrich_status text, enriched_at timestamptz)
    on conflict (hex) do update set
        registration  = coalesce(excluded.registration, a.registration),
        icao_type     = coalesce(excluded.icao_type, a.icao_type),
        type_name     = coalesce(excluded.type_name, a.type_name),
        manufacturer  = coalesce(excluded.manufacturer, a.manufacturer),
        operator      = coalesce(excluded.operator, a.operator),
        country       = coalesce(excluded.country, a.country),
        photo_url     = coalesce(excluded.photo_url, a.photo_url),
        photo_credit  = coalesce(excluded.photo_credit, a.photo_credit),
        photo_link    = coalesce(excluded.photo_link, a.photo_link),
        enrich_status = excluded.enrich_status,
        enriched_at   = excluded.enriched_at;
$$;

-- Result of a route lookup (replaces the cached one)
create function public.save_route(p jsonb)
returns void
language sql
set search_path = ''
as $$
    insert into public.flight_route
    select * from jsonb_populate_record(null::public.flight_route, p)
    on conflict (callsign) do update set
        airline_name = excluded.airline_name, airline_icao = excluded.airline_icao,
        airline_iata = excluded.airline_iata,
        origin_icao = excluded.origin_icao, origin_iata = excluded.origin_iata,
        origin_name = excluded.origin_name, origin_lat = excluded.origin_lat,
        origin_lon = excluded.origin_lon,
        dest_icao = excluded.dest_icao, dest_iata = excluded.dest_iata,
        dest_name = excluded.dest_name, dest_lat = excluded.dest_lat,
        dest_lon = excluded.dest_lon,
        status = excluded.status, fetched_at = excluded.fetched_at;
$$;

-- Only the secret key (service_role) may use the tables and call the functions; the grants
-- are explicit because new tables are not exposed to the Data API automatically
grant select, insert, update, delete on public.aircraft, public.flight_route, public.position,
    public.receiver_snapshot to service_role;
revoke execute on function public.record_batch(jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.save_aircraft_enrichment(jsonb) from public, anon, authenticated;
revoke execute on function public.save_route(jsonb) from public, anon, authenticated;
grant execute on function public.record_batch(jsonb, jsonb, jsonb) to service_role;
grant execute on function public.save_aircraft_enrichment(jsonb) to service_role;
grant execute on function public.save_route(jsonb) to service_role;

-- Retention: the free plan allows a 500 MB database, so history is kept for 7 days
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
    'skytracer-retention',
    '17 3 * * *',
    $$delete from public.position where ts < now() - interval '7 days';
      delete from public.receiver_snapshot where ts < now() - interval '7 days';$$
);
