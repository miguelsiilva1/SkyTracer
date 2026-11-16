# US03 — View airline and route of a flight

**Epic:** E1 · **Priority:** M · **SP:** 5 · **Status:** 🟡 backend in Sprint 1, UI in Sprint 2

## User Story

> As a user, I want to view the airline and route (origin → destination) of a flight.

## Acceptance Criteria

- The route (airline, origin → destination) of each seen callsign is fetched from adsbdb and stored in `flight_route`.
- `/aircraft/live`, `/aircraft/{hex}`, and `/ws/live` return the route along with the position.
- Routes with status other than `ok` (not found / error) are not returned.
- *(Sprint 2)* The aircraft panel displays the airline and route in `OPO → LIS` format.

## Preconditions

- The aircraft is in `aircraft_live` with a known callsign.

## Postconditions

- A row exists in `flight_route` for the callsign, with `status` `ok`, `not_found`, or `error`.

## Main Success Scenario

1. The worker identifies callsigns in `aircraft_live` without a route or with an expired route (TTL 7 days; errors after 1 h).
2. For each callsign, the system queries `GET /v0/callsign/{callsign}` on adsbdb.
3. The system stores airline, origin, and destination (ICAO, IATA, name, coordinates) in `flight_route`.
4. The user requests visible aircraft; the system returns them with the associated route.

## Alternative Flows / Exceptions

| Step | Condition | System response |
|---|---|---|
| 2 | adsbdb returns 404 | Stores `status = not_found` (negative cache) |
| 2 | Failure after all attempts | Stores `status = error`; retries after 1 h |
| 4 | Callsign without `ok` route | Route fields set to `null` |

## Design Rationale

- The route is associated with the **callsign** and not the aircraft: the same aircraft operates multiple flights.
- The API never calls external APIs on user requests; it always reads from the database, ensuring low latency and resilience against external failures.

## Diagrams

- [SSD](puml/ssd_us03.puml) · ![SSD](svg/ssd_us03.svg)
- [SD](puml/sd_us03.puml) · ![SD](svg/sd_us03.svg)
