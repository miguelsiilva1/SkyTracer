# Supplementary Specification (FURPS+)

This document gathers the requirements that are not captured by individual user stories, classified according to the FURPS+ model.

## Functionality

_Features that are not specific to a single use case._

- **Data source:** all aircraft positions come exclusively from the dump1090 receiver provided by the course (`aircraft.json`, dump1090-mutability). External sources are used only to enrich aircraft actually received.
- **Enrichment:** aircraft identification and routes are obtained from adsbdb; photos from planespotters.net, always credited to their photographer with a link to the original page.
- **History:** the positions received are stored (one every 15 seconds per aircraft), enabling track display (US10), replay (US12), statistics (US15) and coverage analysis (US17).
- **Real-time updates:** the current state of the airspace is pushed to clients through a WebSocket, without polling.
- **Security:** no user accounts are required. The API is read-only (`GET`) and served only over HTTPS/WSS, with CORS restricted to the application's origins. The database is reachable only with the secret key held by the Worker (row level security without policies blocks every other client). Credentials are stored as Worker secrets and are never version-controlled.

## Usability

- The application offers the same features on the web, Android and iOS (US18).
- Aircraft are shown on an interactive map with icons oriented by track; details are available with a single selection.
- Information is presented in aeronautical units (feet, knots, degrees), consistent with the source data.
- Photos display the photographer's name, as required by the photo provider's terms.

## Reliability

- Collection, enrichment and API run in a single Durable Object; each step of the loop handles its own errors, so a failure in one (receiver, external API or database) does not stop the others.
- The API serves the live state from memory and never calls external APIs, so the last known state and the history remain available even if the receiver or the external APIs are unreachable.
- History that cannot be written to the database is kept in memory and written with the next batch.
- Failed reads of the receiver are logged and retried on the next cycle without stopping the service.
- External API calls are retried with exponential backoff, honouring `Retry-After`; failures are cached and retried after one hour.
- The next iteration is always scheduled before the current one runs, so the loop survives any failure; Cloudflare restarts the Durable Object automatically if it is evicted.

## Performance

- The receiver is read every 3 seconds.
- Clients receive state updates approximately every 3 seconds.
- At most one position is stored per aircraft every 15 seconds, written to the database in batches every 15 seconds.
- Requests to each external API are limited to one per second.

## Supportability

- **Testability:** parsing logic is implemented as pure functions, tested without network or database access; the Durable Object is tested inside the Workers runtime with the receiver, the database and the external APIs replaced by stubs.
- **Maintainability:** code is type-checked (TypeScript) and tested on every pull request through GitHub Actions.
- **Configurability:** intervals, TTLs, URLs and allowed origins are Worker variables with sensible defaults.
- **Data retention:** historical data is kept for 7 days (daily `pg_cron` job); enrichment caches are refreshed according to their TTL (aircraft: 30 days; route: 7 days).
- **Database evolution:** schema changes are versioned SQL migrations in `supabase/migrations/`.

## +

### Design Constraints

- Scrum process with two-week sprints; every change reaches `main` through a pull request.
- Only free services and free-tier infrastructure may be used; the design must stay within the daily limits of the Cloudflare Workers free plan (100,000 Durable Object requests and 100,000 storage rows written, shared with other applications on the same account) and the 500 MB database of the Supabase free plan.

### Implementation Constraints

- Backend: TypeScript on Cloudflare Workers and Durable Objects.
- Database: PostgreSQL on Supabase, accessed through its REST interface (PostgREST).
- Client: Expo (React Native) with MapLibre, as a single codebase for all platforms.
- Diagrams: PlantUML.

### Interface Constraints

- Input: dump1090 `aircraft.json` over HTTPS.
- External APIs: adsbdb and planespotters.net (REST/JSON), identified by a `User-Agent` that includes contact information.
- Output: REST and WebSocket API (JSON), documented in the repository README.

### Physical Constraints

- The backend runs on Cloudflare Workers (free plan) and the database on Supabase (free plan); no server is managed.
- The web application is published as a static site on GitHub Pages; therefore the API must be served over HTTPS/WSS.
