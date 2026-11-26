# US17 — Receiver coverage map

**Epic:** E4 · **Priority:** M · **SP:** 5 · **Status:** 🟡 data collection running since Sprint 1; analysis and map planned for Sprint 3

## User Story

> As an evaluator, I want a receiver coverage map (range by bearing and RSSI) so that I can identify obstacles that attenuate or block the signal.

## Acceptance Criteria (proposed)

- Every position received by the course receiver (never adsb.fi) is aggregated into `coverage_cell`, a geographic grid of 0.05° cells per altitude band (ground, below 10,000 ft, 10,000–20,000, 20,000–30,000, from 30,000 ft), with the number of positions (and how many by MLAT), the mean and maximum RSSI, the lowest altitude and the first and last time seen. ✅
- The grid is filled from the positions already stored when it is created, is updated by a database trigger on every insert, and is not purged by retention. ✅
- Maximum range is calculated per azimuth sector (e.g. 1°) from the grid, relative to the receiver location.
- The map displays the range polygon and average RSSI per sector, optionally by altitude band.
- It is possible to identify sectors with abnormally reduced range (potential obstacles).

## Design Rationale

- The grid is geographic rather than polar, so it does not depend on the receiver location, which is not published by the receiver: range and bearing are derived from it once the location is fixed, and can be recomputed if it changes.
- Aggregating in the database with a trigger needs no change to the backend, runs in the same transaction as the positions, and keeps the coverage history beyond the 7-day retention of the positions in a few thousand rows.
- Cells of 0.05° are small enough to locate obstacles near the receiver and large enough to accumulate samples quickly far from it.

> The analysis and the map will be specified during Sprint 3 planning, with their SD.

## Diagrams

- [SSD](puml/ssd_us17.puml) · ![SSD](svg/ssd_us17.svg)
- SD: to be produced during Sprint 3 planning.
