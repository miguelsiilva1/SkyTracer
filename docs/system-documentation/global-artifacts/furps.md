# Supplementary Specification (FURPS+)

This document gathers the requirements that are not captured by individual user stories, classified according to the FURPS+ model.

## Functionality

_Features that are not specific to a single use case._

- **Data source:** all aircraft positions come exclusively from the dump1090 receiver provided by the course (`aircraft.json`, dump1090-mutability). External sources are used only to enrich aircraft actually received.
- **Enrichment:** aircraft identification and routes are obtained from adsbdb; photos from planespotters.net, always credited to their photographer with a link to the original page.
- **History:** every position received is stored, enabling track display (US10), replay (US12), statistics (US15) and coverage analysis (US17).
- **Real-time updates:** the current state of the airspace is pushed to clients through a WebSocket, without polling.
- **Security:** no user accounts are required. The database and the API listen only on the local interface; external access to the API is exclusively through an HTTPS reverse proxy. Credentials are supplied through environment variables and are never version-controlled.

## Usability

- The application offers the same features on the web, Android and iOS (US18).
- Aircraft are shown on an interactive map with icons oriented by track; details are available with a single selection.
- Information is presented in aeronautical units (feet, knots, degrees), consistent with the source data.
- Photos display the photographer's name, as required by the photo provider's terms.

## Reliability

- The collector, enricher and API are independent processes that communicate only through the database: the failure of one does not stop the others.
- The API always serves local data, so the last known state and the history remain available even if the receiver or the external APIs are unreachable.
- Failed reads of the receiver are logged and retried on the next cycle without stopping the service.
- External API calls are retried with exponential backoff, honouring `Retry-After`; failures are cached and retried after one hour.
- Services restart automatically after a failure or a host reboot (Docker Compose restart policy).

## Performance

- The receiver is read every second (1 Hz), compensating for the time spent on each cycle.
- Clients receive state updates approximately every second.
- At most one position is stored per aircraft every 5 seconds, limiting storage to about 100 MB per day at peak traffic.
- Requests to each external API are limited to one per second.

## Supportability

- **Testability:** parsing logic is implemented as pure functions, tested without network or database access; database tests run against a dedicated PostgreSQL instance.
- **Maintainability:** code is linted (`ruff`) and tested on every pull request through GitHub Actions.
- **Configurability:** all parameters (intervals, TTLs, retention, URLs) are environment variables with sensible defaults.
- **Data retention:** historical data is kept for 30 days (`RETENTION_DAYS`); enrichment caches are refreshed according to their TTL (aircraft: 30 days; route: 7 days).
- **Database evolution:** schema changes are versioned SQL migrations, applied automatically on startup.

## +

### Design Constraints

- Scrum process with two-week sprints; every change reaches `main` through a pull request.
- The backend services share no state other than the database.
- Only free services and free-tier infrastructure may be used.

### Implementation Constraints

- Backend: Python ≥ 3.11 (FastAPI, httpx, psycopg).
- Database: PostgreSQL 17.
- Client: Expo (React Native) with MapLibre, as a single codebase for all platforms.
- Diagrams: PlantUML.

### Interface Constraints

- Input: dump1090 `aircraft.json` over HTTPS.
- External APIs: adsbdb and planespotters.net (REST/JSON), identified by a `User-Agent` that includes contact information.
- Output: REST and WebSocket API (JSON), documented with OpenAPI.

### Physical Constraints

- Backend and database run on an Oracle Cloud Always Free virtual machine using Docker Compose.
- The web application is published as a static site on GitHub Pages; therefore the API must be served over HTTPS/WSS.
