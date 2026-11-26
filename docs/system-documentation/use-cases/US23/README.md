# US23 — Aircraft from the adsb.fi network

**Epic:** E2 · **Priority:** S · **SP:** 3 · **Status:** ✅ implemented in Sprint 1 (brought forward)

## User Story

> As a user, I want to see aircraft beyond the receiver's reach from a free community network, clearly distinguished from those received in Porto.

## Acceptance Criteria

- The system reads the adsb.fi open data API over four 250 NM areas covering the Iberian Peninsula (Porto, Madrid, Seville, Barcelona), one area per loop iteration, so each area is refreshed about every 12 s and adsb.fi receives at most one request every 3 s (the limit is one per second). Areas overlap; an aircraft seen in several keeps its most recent state.
- Each WebSocket client reports the map area it shows (with a margin) and the selected aircraft; it receives every receiver aircraft but only the network aircraft in that area, so the message size follows what is on screen rather than the whole peninsula.
- Aircraft with a position from the course receiver keep that position; adsb.fi only adds those the receiver does not position.
- Each live aircraft has a `source` (`receiver` or `adsb.fi`). On the map, receiver aircraft are filled icons and adsb.fi aircraft outlined icons, explained in the legend; the user can show all sources or only the receiver.
- The aircraft panel states the source of the position, and parameters the receiver does not decode (GPS altitude, true and indicated airspeed, Mach, wind, temperature) appear in a separate block labelled with adsb.fi.
- adsb.fi data is never stored: history, replay, statistics and coverage use only the course receiver, and the enrichment cache in the database only covers aircraft the receiver has seen.
- adsb.fi is credited with a link on the map and in the panel, as required by its terms.

## Design Rationale

- adsb.fi was chosen among the free, legal sources (no scraping) for its explicit terms: personal, non-commercial use, one request per second, attribution. OpenSky (account and OAuth, about one request every 22 s) and airplanes.live (unconfirmed daily quota) were the alternatives.
- adsb.fi accepts at most a 250 NM radius per request, so a wider coverage needs several areas. Sending every network aircraft to every client would multiply the message size (measured: 366 aircraft, 308 KB every 3 s, against 20 aircraft and 18 KB for the area around Porto), which is heavy on mobile data; filtering by the visible area keeps it proportional to the screen.
- Keeping the network live-only preserves the coverage analysis (US17), which must reflect the course receiver alone, and keeps the database within the free plan.
- The network read happens inside the existing collection loop and writes nothing to the database.

## Production Status

The source is enabled in production. While the backend ran on Cloudflare, every free ADS-B API rejected its requests: adsb.fi (HTTP 403), OpenSky (HTTP 522), adsb.lol (HTTP 429, shared egress addresses) and airplanes.live (HTTP 403); none allows direct browser requests from another site (CORS), and paid sources were rejected. These APIs block datacenter addresses, not residential ones: from a home connection adsb.fi answers HTTP 200. The backend was therefore moved to a home server, published over HTTPS by Tailscale Funnel. The application hides the source legend, filter and attribution whenever no network aircraft are present.

## Diagrams

- SSD and SD to be added with the Sprint 2 review.
