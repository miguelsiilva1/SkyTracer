-- SkyTracer — schema inicial (Sprint 0)

-- Um avião (identificado pelo endereço ICAO de 24 bits)
CREATE TABLE IF NOT EXISTS aircraft (
    hex            CHAR(6) PRIMARY KEY,
    registration   TEXT,
    icao_type      TEXT,
    type_name      TEXT,
    operator       TEXT,
    country        TEXT,
    photo_url      TEXT,
    photo_credit   TEXT,
    enriched_at    TIMESTAMPTZ,
    first_seen     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rota associada a um callsign (vem de adsbdb, guardada em cache)
CREATE TABLE IF NOT EXISTS flight_route (
    callsign       TEXT PRIMARY KEY,
    airline_name   TEXT,
    airline_icao   TEXT,
    origin_icao    TEXT,
    origin_name    TEXT,
    dest_icao      TEXT,
    dest_name      TEXT,
    fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Histórico de posições (base para rastos, replay e mapa de cobertura)
CREATE TABLE IF NOT EXISTS position (
    id             BIGSERIAL PRIMARY KEY,
    hex            CHAR(6) NOT NULL REFERENCES aircraft(hex),
    ts             TIMESTAMPTZ NOT NULL,
    callsign       TEXT,
    lat            DOUBLE PRECISION NOT NULL,
    lon            DOUBLE PRECISION NOT NULL,
    altitude_ft    INTEGER,
    on_ground      BOOLEAN NOT NULL DEFAULT false,
    speed_kt       REAL,
    track_deg      REAL,
    vert_rate_fpm  INTEGER,
    squawk         CHAR(4),
    rssi_dbfs      REAL,
    mlat           BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS position_hex_ts_idx ON position (hex, ts DESC);
CREATE INDEX IF NOT EXISTS position_ts_idx     ON position (ts DESC);

-- Estatísticas do recetor (mensagens/s, nº de aviões) por leitura
CREATE TABLE IF NOT EXISTS receiver_snapshot (
    ts                  TIMESTAMPTZ PRIMARY KEY,
    messages_total      BIGINT,
    aircraft_total      INTEGER,
    aircraft_with_pos   INTEGER
);
