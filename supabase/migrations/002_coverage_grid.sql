-- SkyTracer: receiver coverage grid (US17).
--
-- Every stored position (course receiver only) is added to a geographic grid of 0.05° cells
-- (about 5.5 km north-south and 4.2 km east-west at Porto) per altitude band. The grid does
-- not depend on the receiver location, so range per bearing can be derived from it later, and
-- it is kept without retention, unlike the positions (7 days).

-- Altitude band of a position: 0 on the ground, 1 below 10,000 ft, 2 from 10,000 ft, 3 from
-- 20,000 ft, 4 from 30,000 ft; null when the altitude is unknown
create function public.coverage_band(altitude_ft integer, on_ground boolean)
returns smallint
language sql
immutable
set search_path = ''
as $$
    select case
        when on_ground then 0
        when altitude_ft is null then null
        when altitude_ft < 10000 then 1
        when altitude_ft < 20000 then 2
        when altitude_ft < 30000 then 3
        else 4
    end::smallint;
$$;

-- One cell: floor(lat / 0.05), floor(lon / 0.05) and the altitude band
create table public.coverage_cell (
    lat_idx       integer not null,
    lon_idx       integer not null,
    alt_band      smallint not null,
    samples       integer not null,
    mlat_samples  integer not null,
    rssi_samples  integer not null,
    rssi_sum      double precision not null,
    rssi_max      real,
    min_alt_ft    integer,
    first_seen    timestamptz not null,
    last_seen     timestamptz not null,
    primary key (lat_idx, lon_idx, alt_band)
);

alter table public.coverage_cell enable row level security;
grant select, insert, update, delete on public.coverage_cell to service_role;

-- Adds a set of positions to the grid
create function public.add_to_coverage(p_rows jsonb)
returns void
language sql
set search_path = ''
as $$
    insert into public.coverage_cell as c (lat_idx, lon_idx, alt_band, samples, mlat_samples,
                                           rssi_samples, rssi_sum, rssi_max, min_alt_ft,
                                           first_seen, last_seen)
    select floor(p.lat / 0.05)::integer, floor(p.lon / 0.05)::integer,
           public.coverage_band(p.altitude_ft, p.on_ground),
           count(*), count(*) filter (where p.mlat), count(p.rssi_dbfs),
           coalesce(sum(p.rssi_dbfs), 0), max(p.rssi_dbfs),
           min(p.altitude_ft) filter (where not p.on_ground), min(p.ts), max(p.ts)
    from jsonb_to_recordset(p_rows) as p (
        ts timestamptz, lat double precision, lon double precision, altitude_ft integer,
        on_ground boolean, rssi_dbfs real, mlat boolean)
    where public.coverage_band(p.altitude_ft, p.on_ground) is not null
    group by 1, 2, 3
    on conflict (lat_idx, lon_idx, alt_band) do update
       set samples      = c.samples + excluded.samples,
           mlat_samples = c.mlat_samples + excluded.mlat_samples,
           rssi_samples = c.rssi_samples + excluded.rssi_samples,
           rssi_sum     = c.rssi_sum + excluded.rssi_sum,
           rssi_max     = greatest(c.rssi_max, excluded.rssi_max),
           min_alt_ft   = least(c.min_alt_ft, excluded.min_alt_ft),
           first_seen   = least(c.first_seen, excluded.first_seen),
           last_seen    = greatest(c.last_seen, excluded.last_seen);
$$;

-- Fill the grid with the positions already stored (directly, without building one large JSON),
-- then keep it up to date on every insert
insert into public.coverage_cell (lat_idx, lon_idx, alt_band, samples, mlat_samples, rssi_samples,
                                  rssi_sum, rssi_max, min_alt_ft, first_seen, last_seen)
select floor(p.lat / 0.05)::integer, floor(p.lon / 0.05)::integer,
       public.coverage_band(p.altitude_ft, p.on_ground),
       count(*), count(*) filter (where p.mlat), count(p.rssi_dbfs),
       coalesce(sum(p.rssi_dbfs), 0), max(p.rssi_dbfs),
       min(p.altitude_ft) filter (where not p.on_ground), min(p.ts), max(p.ts)
from public.position as p
where public.coverage_band(p.altitude_ft, p.on_ground) is not null
group by 1, 2, 3;

create function public.position_to_coverage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    perform public.add_to_coverage(coalesce(
        (select jsonb_agg(to_jsonb(n)) from (
            select ts, lat, lon, altitude_ft, on_ground, rssi_dbfs, mlat from new_rows) as n),
        '[]'::jsonb));
    return null;
end;
$$;

create trigger position_coverage
    after insert on public.position
    referencing new table as new_rows
    for each statement
    execute function public.position_to_coverage();

revoke execute on function public.add_to_coverage(jsonb) from public, anon, authenticated;
revoke execute on function public.position_to_coverage() from public, anon, authenticated;
grant execute on function public.add_to_coverage(jsonb) to service_role;
