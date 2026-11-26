# US04 — View photo, registration, and model of the aircraft

**Epic:** E1 · **Priority:** S · **SP:** 3 · **Status:** ✅ backend in Sprint 1, user interface brought forward to the end of Sprint 1

## User Story

> As a user, I want to view the photo, registration, and model of the aircraft.

## Acceptance Criteria

- Registration, model, manufacturer, operator, and country come from adsbdb.
- The photo comes from planespotters.net, with the photographer's name and link to the photo page (required by API terms).
- `GET /aircraft/{hex}` returns these data and the live state (`live`, `null` if not currently seen); `404` if the hex is unknown.
- The panel displays the photo at the top, with the photographer's name linking to the photo page, and the registration, model and operator under the callsign.

## Preconditions

- The aircraft is currently seen by the receiver (it is in the live state).

## Postconditions

- The aircraft row in `aircraft` has `enrich_status` (`ok`, `not_found`, or `error`) and `enriched_at`.

## Main Success Scenario

1. On each loop iteration, the system identifies a visible aircraft to be enriched or with expired data (TTL 30 days; errors after 1 h), looking first in the memory cache and then in `aircraft`.
2. The system queries adsbdb (`/aircraft/{hex}`) and planespotters (`/hex/{hex}`).
3. The system saves the result in `aircraft` (`save_aircraft_enrichment`) without overwriting already known values, and in the memory cache.
4. The user requests details for an aircraft; the system returns identification, photograph, and live state.

## Alternative Flows / Exceptions

| Step | Condition | System response |
|---|---|---|
| 2 | Neither API knows the aircraft | `enrich_status = not_found` |
| 2 | 429, 5xx or network error | Backs off and retries on a later iteration |
| 2 | Failure after 4 attempts or other 4xx | `enrich_status = error`; retries after 1 h |
| 4 | `hex` with invalid format | `422` |
| 4 | Unknown `hex` | `404 "Unknown aircraft"` |

## Design Rationale

- `COALESCE(new, current)` in `save_aircraft_enrichment`: an incomplete response does not overwrite previously obtained data.
- It is sufficient for one of the sources to respond for the status to be `ok`.
- Aircraft are enriched before routes, so identification and photo appear first.

## Diagrams

- [SSD](puml/ssd_us04.puml) · ![SSD](svg/ssd_us04.svg)
- [SD](puml/sd_us04.puml) · ![SD](svg/sd_us04.svg)
