# US23 — Aircraft from the adsb.fi network

**Epic:** E2 · **Priority:** S · **SP:** 3 · **Status:** ⏸️ implemented in Sprint 2, disabled in production

## User Story

> As a user, I want to see aircraft beyond the receiver's reach from a free community network, clearly distinguished from those received in Porto.

## Acceptance Criteria

- Every 10 s the system reads the aircraft within 250 NM of Porto from the adsb.fi open data API (at most one request per second is allowed).
- Aircraft with a position from the course receiver keep that position; adsb.fi only adds those the receiver does not position.
- Each live aircraft has a `source` (`receiver` or `adsb.fi`). On the map, receiver aircraft are filled icons and adsb.fi aircraft outlined icons, explained in the legend; the user can show all sources or only the receiver.
- The aircraft panel states the source of the position, and parameters the receiver does not decode (GPS altitude, true and indicated airspeed, Mach, wind, temperature) appear in a separate block labelled with adsb.fi.
- adsb.fi data is never stored: history, replay, statistics and coverage use only the course receiver, and the enrichment cache in the database only covers aircraft the receiver has seen.
- adsb.fi is credited with a link on the map and in the panel, as required by its terms.

## Design Rationale

- adsb.fi was chosen among the free, legal sources (no scraping) for its explicit terms: personal, non-commercial use, one request per second, attribution. OpenSky (account and OAuth, about one request every 22 s) and airplanes.live (unconfirmed daily quota) were the alternatives.
- Keeping the network live-only preserves the coverage analysis (US17), which must reflect the course receiver alone, and keeps the database within the free plan.
- The network read happens inside the existing alarm, so it adds no Durable Object requests or storage writes.

## Production Status

The source is disabled in production (empty network URL). Tests from Cloudflare's servers showed that every free ADS-B API rejects them: adsb.fi (HTTP 403), OpenSky (HTTP 522), adsb.lol (HTTP 429, shared egress addresses) and airplanes.live (HTTP 403); none allows direct browser requests from another site (CORS). Working around these restrictions (proxies, home relays) was rejected, as was any paid source. The implementation and its tests are kept; the application hides the source legend, filter and attribution while no network aircraft are present.

## Diagrams

- SSD and SD to be added with the Sprint 2 review.
