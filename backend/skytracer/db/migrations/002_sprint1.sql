-- Sprint 1: estado live, categoria, estado do enriquecimento e rotas mais completas

ALTER TABLE aircraft
    ADD COLUMN IF NOT EXISTS category      TEXT,
    ADD COLUMN IF NOT EXISTS manufacturer  TEXT,
    ADD COLUMN IF NOT EXISTS photo_link    TEXT,
    -- NULL = por enriquecer; 'ok' / 'not_found' / 'error' (cache negativa evita repetir pedidos)
    ADD COLUMN IF NOT EXISTS enrich_status TEXT;

ALTER TABLE flight_route
    ADD COLUMN IF NOT EXISTS airline_iata  TEXT,
    ADD COLUMN IF NOT EXISTS origin_iata   TEXT,
    ADD COLUMN IF NOT EXISTS origin_lat    DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS origin_lon    DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS dest_iata     TEXT,
    ADD COLUMN IF NOT EXISTS dest_lat      DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS dest_lon      DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS status        TEXT NOT NULL DEFAULT 'ok';

-- Último estado de cada avião, atualizado a cada leitura (1 s). UNLOGGED: é reconstruído
-- em segundos a partir do dump1090, por isso não precisa de WAL nem de sobreviver a crashes.
CREATE UNLOGGED TABLE IF NOT EXISTS aircraft_live (
    hex            CHAR(6) PRIMARY KEY,
    seen_at        TIMESTAMPTZ NOT NULL,
    pos_at         TIMESTAMPTZ,
    callsign       TEXT,
    lat            DOUBLE PRECISION,
    lon            DOUBLE PRECISION,
    altitude_ft    INTEGER,
    on_ground      BOOLEAN NOT NULL DEFAULT false,
    speed_kt       REAL,
    track_deg      REAL,
    vert_rate_fpm  INTEGER,
    squawk         CHAR(4),
    category       TEXT,
    rssi_dbfs      REAL,
    mlat           BOOLEAN NOT NULL DEFAULT false,
    messages       BIGINT
);

CREATE INDEX IF NOT EXISTS aircraft_enrich_idx ON aircraft (enriched_at NULLS FIRST);
CREATE INDEX IF NOT EXISTS receiver_snapshot_ts_idx ON receiver_snapshot (ts DESC);
