# Product Backlog — SkyTracer

The project is managed with **Scrum** in two-week sprints. Priorities follow the MoSCoW method (M = Must have, S = Should have, C = Could have). Story points (SP) use the Fibonacci scale; they are initial estimates and are reviewed during each sprint planning.

## 1. Epics

| ID | Epic |
|---|---|
| E1 | Data collection and enrichment (dump1090 and external sources) |
| E2 | Map and visualisation |
| E3 | Premium features |
| E4 | Coverage analysis and reporting |
| E5 | Cross-platform application |

## 2. User Stories

| ID | Epic | Priority | SP | User story |
|---|---|---|---|---|
| US01 | E1 | M | 3 | As the system, I want to read the dump1090 `aircraft.json` every few seconds so that aircraft positions are kept up to date. |
| US02 | E1 | M | 5 | As the system, I want to store every position in PostgreSQL so that a flight history is preserved. |
| US03 | E1 | M | 5 | As a user, I want to see the airline and route (origin → destination) of a flight. |
| US04 | E1 | S | 3 | As a user, I want to see the photo, registration and model of an aircraft. |
| US05 | E1 | S | 3 | As the system, I want to cache enrichment data so that external APIs are not overloaded. |
| US06 | E2 | M | 5 | As a user, I want to see aircraft on a real-time map, with icons oriented by track. |
| US07 | E2 | M | 3 | As a user, I want to select an aircraft and see a panel with its altitude, speed, squawk, route and photo. |
| US08 | E2 | M | 5 | As a user, I want to filter aircraft by origin/destination airport, altitude, airline and aircraft type. |
| US09 | E2 | S | 2 | As a user, I want to search by callsign, registration or ICAO address. |
| US10 | E2 | S | 3 | As a user, I want to see the track an aircraft has already flown. |
| US11 | E2 | C | 2 | As a user, I want to see concise weather information (METAR: wind, visibility) in the airport panel and as an indicator on the map. |
| US12 | E3 | S | 8 | As a user, I want to select a past instant on a timeline and see the airspace as it was (replay). |
| US13 | E3 | S | 5 | As a user, I want to enable, disable and configure alerts (emergency squawks 7500/7600/7700, a specific aircraft or model, military aircraft). |
| US14 | E3 | C | 5 | As a user, I want to see arrivals and departures at Porto Airport (LPPR). |
| US15 | E3 | C | 3 | As a user, I want daily statistics (top airlines, highest and fastest aircraft, peak hours). |
| US16 | E3 | C | 8 | As a user, I want a 3D view of the flights. |
| US17 | E4 | M | 5 | As an evaluator, I want a receiver coverage map (range per bearing and RSSI) to identify obstacles that attenuate or block the signal. |
| US18 | E5 | M | 8 | As a user, I want to use the application on the web, Android and iOS with the same features. |
| US19 | E5 | C | 2 | As a user, I want to save favourite flights or aircraft. |
| US21 | E5 | S | 2 | As a user, I want to use the application in English or Portuguese. |
| US22 | E2 | C | 8 | As a user, I want to see the full data of a flight and its aircraft (schedule and actual times, serial number, age, country of registration, FIR and all flight parameters). |
| US23 | E2 | S | 3 | As a user, I want to see aircraft beyond the receiver's reach from a free community network, clearly distinguished from those received in Porto. |
| US20 | E5 | C | 8 | As a user, I want to create an account and sign in so that my favourites, alerts and preferences follow me across devices. *(future, after the course delivery)* |

## 3. Acceptance Criteria

Status: ✅ done · 🟡 partial (backend done, user interface pending)

**US01** ✅
- Given that the course receiver's `aircraft.json` is available, the system reads it every 3 seconds.
- Fields from both dump1090-mutability (`altitude`, `speed`) and dump1090-fa (`alt_baro`, `gs`) are accepted.
- If a read fails, the error is logged and the read is retried on the next iteration without stopping the service.
- The position timestamp is derived from `seen_pos`; positions older than 60 s are not considered current.

**US02** ✅
- Every aircraft observed is stored in the `aircraft` table with `first_seen` and `last_seen`.
- Each aircraft's position is stored at most once every 15 seconds.
- Aircraft without a position do not produce rows in `position`.
- The same position is never stored twice.
- The current state of each aircraft is kept in memory and updated on every read.
- Retention: rows in `position` and `receiver_snapshot` are deleted after 7 days.

**US03** ✅ (backend and user interface in Sprint 1)
- The route (airline, origin → destination) of every callsign observed is fetched from adsbdb and stored in `flight_route`.
- `/aircraft/live`, `/aircraft/{hex}` and `/ws/live` return the route together with the position.

**US04** ✅ (backend and user interface in Sprint 1)
- Registration, model and operator are fetched from adsbdb; the photo is fetched from planespotters, together with the photographer's name and a link to the photo page.

**US05** ✅
- Each ICAO address and each callsign is queried once and cached (aircraft: 30 days; route: 7 days).
- "Not found" responses are also cached; errors are retried after 1 hour.
- At most one request per second is sent to each API, with exponential backoff retries (honouring `Retry-After`).

## 4. Sprint Plan

| Sprint | Dates | Goal | Stories |
|---|---|---|---|
| 0 | 10 – 16 Nov | Repository, architecture, Docker environment and backlog | — |
| 1 | 17 – 30 Nov | Data collection and persistence running in the cloud | US01, US02, US05 ✅; backend of US03 and US04 (brought forward from Sprint 2); REST and WebSocket API; brought forward from Sprint 2: web map, aircraft panel and track (US03, US04, US06, US07, US10), adsb.fi source (US23) |
| 2 | 1 – 14 Dec | Complete map with enrichment | US08 and US09 ✅ and US21 ✅ (brought forward to the end of Sprint 1); wider adsb.fi coverage; closing US03, US04, US06, US07 and US10 |
| 3 | 15 – 28 Dec | Cross-platform application, alerts, replay and coverage | US12, US13, US17, US18 |
| 4 | 29 Dec – 5 Jan | Additional features, polishing, report and demo rehearsal | US11, US14–US16, US19 |

### 4.1 Changes to the plan

- **Deployment (Sprint 1).** The backend was planned on an Oracle Cloud Always Free virtual machine, whose capacity was unavailable. It was rewritten in TypeScript for Cloudflare Workers with a Durable Object, and later moved to a home server (Node.js in Docker, published over HTTPS by Tailscale Funnel), because the free ADS-B network APIs reject requests from Cloudflare's addresses.
- **Scope brought forward.** The web map, the aircraft panel, the track, the adsb.fi source, search and filters, and the Portuguese translation were delivered in Sprint 1, ahead of the plan, which leaves Sprint 2 for closing those stories and Sprint 3 unchanged.

## 5. Definition of Done

- Code is merged into `main` through a pull request with a passing CI pipeline.
- Data parsing and processing logic is covered by tests.
- The feature is available in the deployed environment, not only locally.
- Documentation and README files are updated where applicable.
