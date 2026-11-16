# US02 — Store positions in PostgreSQL

**Epic:** E1 · **Priority:** M · **SP:** 5 · **Status:** ✅ Sprint 1

## User Story

> As the system, I want to store each position in PostgreSQL so that flight history is maintained.

## Acceptance Criteria

- Each seen aircraft is recorded in the `aircraft` table with `first_seen` / `last_seen`.
- The position of each aircraft is stored at most every `POSITION_MIN_INTERVAL_SECONDS` (5 s).
- Aircraft without a position, or with a position older than 60 s, do not generate rows in `position`.
- The same position is not stored twice.
- The live state of each aircraft is kept in `aircraft_live`, updated on every read; it is removed after `LIVE_EXPIRY_SECONDS` (300 s) without messages.
- A receiver summary is stored in `receiver_snapshot` every `SNAPSHOT_INTERVAL_SECONDS` (10 s).
- Retention: `position` and `receiver_snapshot` are deleted after `RETENTION_DAYS` (30).

## Preconditions

- The database is accessible and migrations have been applied (each service applies them on startup).
- A `Snapshot` produced by US01 is available.

## Postconditions

- `aircraft`, `aircraft_live`, `position`, and `receiver_snapshot` reflect the read, within a single transaction.

## Main Success Scenario

1. The system selects aircraft with recent positions whose last stored position is ≥ 5 s old.
2. The system upserts all aircraft into `aircraft` and `aircraft_live`.
3. The system removes aircraft from `aircraft_live` with no messages for more than 300 s.
4. The system inserts the selected positions into `position`.
5. If ≥ 10 s have elapsed since the last summary, it inserts a row into `receiver_snapshot`.
6. The system commits the transaction and only then updates in-memory state.

## Alternative Flows / Exceptions

| Step | Condition | System response |
|---|---|---|
| 2–6 | SQL error | `rollback`; the next read is processed normally |
| 2–6 | Database connection lost | Closes connection and reconnects after 5 s |

## Design Rationale

- `aircraft_live` is `UNLOGGED`: it is written at 1 Hz and rebuilds in seconds, therefore dispensing with WAL.
- `last_position` is updated **after** the `commit` to avoid losing positions if the transaction fails.
- `GREATEST(last_seen)` and `COALESCE(category)` prevent older or null data from overwriting valid data.
- Purging old data runs in a separate worker every 24 h so as not to block the collector.

## Diagrams

- [SSD](puml/ssd_us02.puml) · ![SSD](svg/ssd_us02.svg)
- [SD](puml/sd_us02.puml) · ![SD](svg/sd_us02.svg)
