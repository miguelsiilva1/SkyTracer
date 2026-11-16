# SkyTracer

Real-time air traffic visualisation system for the Porto region, developed for the Aeronautical Telecommunication Systems course (STAER) at ISEP / DEE.

The system collects the Mode S / ADS-B messages decoded by the **dump1090** receiver provided by the course, persists them in a database and enriches them with information from free public sources (routes, photos, registrations and weather). Its goal is to offer, at no cost, features that are paid in commercial services such as FlightRadar24: history and replay, alerts, statistics and a receiver coverage map.

## Contents

1. [Architecture](#1-architecture)
2. [Repository structure](#2-repository-structure)
3. [Data source](#3-data-source)
4. [Services](#4-services)
5. [Running locally](#5-running-locally)
6. [Testing](#6-testing)
7. [Production deployment](#7-production-deployment)
8. [Project management and documentation](#8-project-management-and-documentation)

## 1. Architecture

```
 dump1090 (STAER course)       Public APIs (adsbdb, planespotters, OurAirports, METAR)
        │  aircraft.json                 │
        ▼                                ▼
 ┌──────────────┐            ┌──────────────┐
 │  collector   │            │   enricher   │
 └──────┬───────┘            └──────┬───────┘
        │ write                     │ write
        ▼                           ▼
              ┌──────────────┐
              │  PostgreSQL  │
              └──────┬───────┘
                     │ read
              ┌──────▼───────┐   REST + WebSocket   ┌──────────────────────────┐
              │  FastAPI API │ ───────────────────▶ │ Expo app (React Native)  │
              └──────────────┘                      │ web · Android · iOS      │
                                                    └──────────────────────────┘
```

The three backend services are independent processes that communicate exclusively through the database. As a result, the API always serves local data and remains available (last known state and history) even if the receiver or the external APIs fail.

## 2. Repository structure

| Folder | Contents |
|---|---|
| `backend/` | Python code: `collector` (dump1090 ingestion), `enrichment` (enrichment and retention), `api` (FastAPI) and `db` (SQL migrations); tests in `backend/tests/` |
| `app/` | Expo / React Native application (web, Android and iOS), with MapLibre maps |
| `infra/` | `docker-compose.yml` with the database and the services |
| `docs/` | Backlog and system documentation (glossary, domain model, class diagram, use cases, SSD and SD) |
| `.github/workflows/` | Continuous integration (linting and tests) |

## 3. Data source

All positions come exclusively from the course receiver:

`https://ads-b.jcboliveira.xyz/dump1090/data/aircraft.json` (dump1090-mutability)

External APIs are used only to **enrich** the aircraft actually received by this receiver.

## 4. Services

| Service | Command | Responsibility |
|---|---|---|
| `collector` | `python -m skytracer.collector` | Reads `aircraft.json` every second. Updates the current state of each aircraft (`aircraft_live`) on every read; stores at most one position every 5 s per aircraft (`position`), only for positions whose age (`seen_pos`) is ≤ 60 s; and records a receiver summary (`receiver_snapshot`) every 10 s. |
| `enricher` | `python -m skytracer.enrichment` | For each received aircraft, queries [adsbdb](https://www.adsbdb.com) (registration, model, operator and route) and [planespotters.net](https://www.planespotters.net) (photo, credited to its author). Requests are limited to one per second per API, retried with exponential backoff and cached in the database (aircraft: 30 days; route: 7 days; "not found" responses are also cached; errors are retried after 1 hour). It also runs the daily retention cleanup. |
| `api` | `uvicorn skytracer.api.main:app` | Exposes the REST and WebSocket interface, always from the local database. |

All services apply pending migrations (`backend/skytracer/db/migrations/NNN_*.sql`) on startup. Migrations can be applied manually with `python -m skytracer.db.migrate`.

### 4.1 API

| Endpoint | Description |
|---|---|
| `GET /health` | Service health check |
| `GET /aircraft/live?max_age_seconds=60` | Aircraft with a recent position, including enrichment (registration, model, photo) and route (origin and destination) |
| `GET /aircraft/{hex}` | Aircraft data and its current state (`live`, `null` if it is not currently being received) |
| `GET /aircraft/{hex}/track?minutes=60` | Track: positions stored in the last *N* minutes (maximum 1440) |
| `WS /ws/live` | Sends the current state on connection and then every ~1 s, in the format `{"ts": ..., "aircraft": [...]}`, identical to `/aircraft/live` |

Interactive documentation (OpenAPI) is available at `http://127.0.0.1:8000/docs`.

### 4.2 Retention policy

| Table | Write frequency | Retention period |
|---|---|---|
| `aircraft_live` | One row per aircraft, updated every second (`UNLOGGED`) | 5 min without messages (`LIVE_EXPIRY_SECONDS`) |
| `position` | ≤ 1 per aircraft every 5 s (`POSITION_MIN_INTERVAL_SECONDS`); about 100 MB/day at peak traffic | 30 days (`RETENTION_DAYS`) |
| `receiver_snapshot` | One every 10 s (`SNAPSHOT_INTERVAL_SECONDS`) | 30 days (`RETENTION_DAYS`) |
| `aircraft`, `flight_route` | Enrichment cache | Unlimited (small tables, refreshed according to their TTL) |

The coverage map (US17) will use an aggregated table (maximum range per bearing) that is not subject to retention.

## 5. Running locally

**Prerequisites:** Python ≥ 3.11 and Docker.

```bash
# 1. Database
docker compose --env-file .env -f infra/docker-compose.yml up -d db

# 2. Backend
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
python -m skytracer.collector             # data collection
python -m skytracer.enrichment            # enrichment (in another terminal)
uvicorn skytracer.api.main:app --reload   # API at http://localhost:8000/docs
```

Alternatively, the database and the three services can be started together:

```bash
docker compose --env-file .env -f infra/docker-compose.yml up --build
```

## 6. Testing

```bash
cd backend
ruff check . && pytest -q
```

Tests marked `db` require a test PostgreSQL instance and are skipped when it is not available:

```bash
docker run -d --name skytracer-test-db -p 5433:5432 \
  -e POSTGRES_USER=skytracer -e POSTGRES_PASSWORD=skytracer -e POSTGRES_DB=skytracer_test postgres:17
```

The address can be changed with the `TEST_DATABASE_URL` variable. Continuous integration uses a `postgres:17` service.

## 7. Production deployment

| Component | Platform |
|---|---|
| collector, enricher, API and PostgreSQL | Oracle Cloud Always Free VM (Docker Compose) |
| Web application (static Expo export) | GitHub Pages |
| CI/CD | GitHub Actions |

## 8. Project management and documentation

The project follows the Scrum methodology, with two-week sprints until the final delivery (first week of January 2027).

- [Product backlog and sprint plan](docs/backlog.md)
- [System documentation](docs/system-documentation/README.md): glossary, domain model, class diagram, use case diagram and, for each user story, acceptance criteria, SSD and SD.
