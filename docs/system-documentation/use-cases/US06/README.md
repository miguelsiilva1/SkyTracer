# US06 — View aircraft on a real-time map

**Epic:** E2 · **Priority:** M · **SP:** 5 · **Status:** 🟡 backend (WebSocket) in Sprint 1, app in Sprint 2

## User Story

> As a user, I want to view aircraft on a real-time map, with icons oriented by track.

## Acceptance Criteria

- Upon connecting to `WS /ws/live`, the client immediately receives the live state and thereafter a message every ~3 s (one per loop iteration).
- Each message has the format `{"ts": ..., "aircraft": [...]}`, identical to `GET /aircraft/live`.
- Only aircraft with a position received ≤ 60 s ago are sent.
- *(Sprint 2)* The app draws each aircraft on the MapLibre map with its icon rotated according to `track_deg`.
- *(Sprint 2)* If the connection drops, the app reconnects automatically.

## Preconditions

- The `Tracker` Durable Object is running its collection loop.

## Postconditions

- The map reflects the live state with latency ≤ ~3 s.

## Main Success Scenario

1. The user opens the map.
2. The app opens a WebSocket connection to `/ws/live`.
3. The system accepts the connection as a hibernatable WebSocket and sends the live state.
4. On each loop iteration (every 3 s), the system builds the message **once** and sends it to all connected clients.
5. The app updates the position and orientation of the icons.

## Alternative Flows / Exceptions

| Step | Condition | System response |
|---|---|---|
| 4 | Client disconnected | The send error is ignored; the runtime removes the socket |
| 4 | dump1090 unavailable | Continues sending the last known state until expired |

## Design Rationale

- **Single broadcast**: the message is built once per iteration from memory, with no database access, regardless of the number of clients.
- Hibernatable WebSockets (`ctx.acceptWebSocket`) are kept by the Cloudflare runtime, so open connections do not keep the Durable Object billed between iterations.
- The initial state is sent upon connection, so the client does not wait for the next iteration.

## Diagrams

- [SSD](puml/ssd_us06.puml) · ![SSD](svg/ssd_us06.svg)
- [SD](puml/sd_us06.puml) · ![SD](svg/sd_us06.svg)
