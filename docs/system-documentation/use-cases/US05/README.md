# US05 — Enrichment caching

**Epic:** E1 · **Priority:** S · **SP:** 3 · **Status:** ✅ Sprint 1

## User Story

> As the system, I want to cache enrichment data so that I do not overuse external APIs.

## Acceptance Criteria

- Each hex and each callsign is queried once and cached (aircraft 30 days, route 7 days).
- "Not found" is also cached; errors are retried after 1 h.
- At most 1 request/s per API, with exponential retry and backoff (respects `Retry-After`).
- Only aircraft currently seen by the receiver are enriched.

## Preconditions

- Aircraft exist in `aircraft_live`.

## Postconditions

- No repeated requests within the TTL; the request rate per API never exceeds the configured rate.

## Main Success Scenario

1. The worker selects only visible aircraft/callsigns without valid cache.
2. Before each request, `RateLimitedClient` waits as needed to respect 1 request/s.
3. The response (or its absence) is stored with status and timestamp.

## Alternative Flows / Exceptions

| Step | Condition | System response |
|---|---|---|
| 2 | HTTP 404 | Returns `None` → negative cache (`not_found`) |
| 2 | HTTP 429 / 5xx / network error | Waits for `Retry-After` or `base · 2^attempt` (max. 60 s) and retries up to 5 attempts |
| 2 | Other 4xx or invalid JSON | Immediate `EnrichmentError` → `error` |
| 2 | Exhausted attempts | `EnrichmentError` → `error`, retried after 1 h |

## Design Rationale

- One `RateLimitedClient` per API, because each API has its own limits.
- The TTL is applied directly in the selection SQL (`AIRCRAFT_TODO`, `ROUTES_TODO`), so the database serves as the cache and survives restarts.
- `sleep` and `clock` are injectable, allowing throttle and backoff to be tested without real delays.

## Diagrams

- [SSD](puml/ssd_us05.puml) · ![SSD](svg/ssd_us05.svg)
- [SD](puml/sd_us05.puml) · ![SD](svg/sd_us05.svg)
