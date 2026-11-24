# SkyTracer

Real-time air traffic visualisation system for the Porto region, developed for the Aeronautical Telecommunication Systems course (STAER) at ISEP / DEE.

The system collects the Mode S / ADS-B messages decoded by the **dump1090** receiver provided by the course, persists them in a database and enriches them with information from free public sources (routes, photos, registrations and weather). Its goal is to offer, at no cost, features that are paid in commercial services such as FlightRadar24: history and replay, alerts, statistics and a receiver coverage map.

## Contents

1. [Architecture](#1-architecture)
2. [Repository structure](#2-repository-structure)
3. [Data source](#3-data-source)
4. [Backend](#4-backend)
5. [Running locally](#5-running-locally)
6. [Testing](#6-testing)
7. [Production deployment](#7-production-deployment)
8. [Project management and documentation](#8-project-management-and-documentation)

## 1. Architecture

```
 dump1090 (STAER course)          Public APIs (adsbdb, planespotters)
        │  aircraft.json every 3 s          │
        ▼                                   ▼
 ┌──────────────────────────────────────────────────────┐
 │  Cloudflare Worker + Tracker Durable Object          │
 │  collection loop · live state (memory) · enrichment  │   REST + WebSocket   ┌──────────────────────────┐
 │  REST / WebSocket API                                │ ───────────────────▶ │ Expo app (React Native)  │
 └──────────────────────────┬───────────────────────────┘                      │ web · Android · iOS      │
                            │ batched writes / history reads                   └──────────────────────────┘
                            ▼
                 ┌──────────────────────┐
                 │ Supabase (PostgreSQL)│
                 └──────────────────────┘
```

A single Durable Object (`Tracker`) runs the whole backend. An alarm fires every 3 s: it reads the receiver, updates the live state of each aircraft in memory, enriches at most one aircraft or route, writes the buffered history to Supabase every 15 s and pushes the live state to the WebSocket clients. The API serves the live state from memory and the history from Supabase, so it keeps answering (last known state and history) even if the receiver or the external APIs fail.

The design fits the free plans: the live state never touches storage (the Durable Object free plan allows 100,000 rows written per day), and the history is written in one request per flush to Supabase, whose free plan limits the database to 500 MB.

## 2. Repository structure

| Folder | Contents |
|---|---|
| `backend/` | TypeScript Worker: `dump1090` (parsing), `collector` (live state and history buffer), `enrichment` (adsbdb, planespotters), `tracker` (Durable Object: loop and API) and `index` (entry point); tests in `backend/test/` |
| `supabase/` | Database migrations (tables, write functions and retention job) |
| `app/` | Expo / React Native application (web, Android and iOS), with MapLibre maps |
| `docs/` | Backlog and system documentation (glossary, domain model, class diagram, use cases, SSD and SD) |
| `.github/workflows/` | Continuous integration (type checking and tests) |

## 3. Data source

All positions come exclusively from the course receiver:

`https://ads-b.jcboliveira.xyz/dump1090/data/aircraft.json` (dump1090-mutability)

External APIs are used only to **enrich** the aircraft actually received by this receiver.

## 4. Backend

| Component | Responsibility |
|---|---|
| Collection | Reads `aircraft.json` every 3 s. Updates the live state of each aircraft in memory on every read; buffers at most one position every 15 s per aircraft, only for positions whose age (`seen_pos`) is ≤ 60 s; and a receiver summary every 15 s. The buffer is written to Supabase every 15 s in a single call and kept for the next attempt if the write fails. |
| Enrichment | For each received aircraft, queries [adsbdb](https://www.adsbdb.com) (registration, model, operator and route) and [planespotters.net](https://www.planespotters.net) (photo, credited to its author). At most one request per API per loop iteration, with exponential backoff (or the server's `Retry-After`) on errors. Results are cached in Supabase and in memory (aircraft: 30 days; route: 7 days; "not found" responses are also cached; errors are retried after 1 hour). |
| API | REST and WebSocket interface: live data from memory, history and aircraft details from Supabase. |

### 4.1 API

| Endpoint | Description |
|---|---|
| `GET /health` | Service health check, with the time of the last successful receiver read and the number of live aircraft |
| `GET /aircraft/live?max_age_seconds=60` | Aircraft with a recent position, including enrichment (registration, model, photo) and route (origin and destination) |
| `GET /aircraft/{hex}` | Aircraft data and its current state (`live`, `null` if it is not currently being received) |
| `GET /aircraft/{hex}/track?minutes=60` | Track: positions stored in the last *N* minutes (maximum 1440) |
| `WS /ws/live` | Sends the current state on connection and then every ~3 s, in the format `{"ts": ..., "aircraft": [...]}`, identical to `/aircraft/live` |

### 4.2 Retention policy

| Data | Write frequency | Retention period |
|---|---|---|
| Live state | In memory, updated every 3 s | 5 min without messages |
| `position` | ≤ 1 per aircraft every 15 s | 7 days (daily `pg_cron` job) |
| `receiver_snapshot` | One every 15 s | 7 days (daily `pg_cron` job) |
| `aircraft`, `flight_route` | Enrichment cache | Unlimited (small tables, refreshed according to their TTL) |

The coverage map (US17) will use an aggregated table (maximum range per bearing) that is not subject to retention.

## 5. Running locally

**Prerequisites:** Node.js ≥ 22.

```bash
cd backend
npm install
npm run dev      # Worker and Durable Object at http://localhost:8787
```

The local Worker writes to the Supabase project configured in Wrangler's local secrets file.

## 6. Testing

```bash
cd backend
npm run typecheck
npm test
```

The tests run inside the Workers runtime (Vitest with the Cloudflare plugin), with the receiver, Supabase and the external APIs replaced by stubs.

## 7. Production deployment

| Component | Platform |
|---|---|
| Collection, enrichment and API | Cloudflare Workers + Durable Objects (free plan) |
| History and enrichment cache | Supabase PostgreSQL (free plan) |
| Web application (static Expo export) | GitHub Pages |
| CI/CD | GitHub Actions |

```bash
cd backend
npx wrangler deploy
```

The Supabase project URL, its secret key and the HTTP User-Agent (with contact details, required by planespotters) are configured as Worker secrets. After a deploy, any request (for example `GET /health`) starts the collection loop.

## 8. Project management and documentation

The project follows the Scrum methodology, with two-week sprints until the final delivery (first week of January 2027).

- [Product backlog and sprint plan](docs/backlog.md)
- [System documentation](docs/system-documentation/README.md): glossary, domain model, class diagram, use case diagram and, for each user story, acceptance criteria, SSD and SD.
