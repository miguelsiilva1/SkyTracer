# US22 — Extended aircraft and flight data

**Epic:** E2 · **Priority:** C · **SP:** 8 · **Status:** ⏳ to be planned (depends on data sources)

## User Story

> As a user, I want to see the full data of a flight and its aircraft, as in commercial trackers: schedule and actual times, aircraft details and the complete set of flight parameters.

## Data Availability

The course receiver runs dump1090-mutability, which exports only the fields decoded from ADS-B identification, position and velocity messages. Fields marked "not received" need Comm-B (Mode S EHS) messages or a schedule provider.

| Field | Status | Source |
|---|---|---|
| ICAO address, squawk, latitude and longitude | ✅ available | Receiver |
| Barometric altitude, vertical rate, track, ground speed | ✅ available | Receiver |
| Aircraft type, registration | ✅ available (US04) | adsbdb |
| Country of registration | 🟡 to display | adsbdb (registered owner country); can also be derived from the ICAO address block |
| Serial number (MSN), age | ⏳ needs a source | Not in adsbdb; candidate: OpenSky aircraft metadata (serial number and build date), to be validated |
| FIR / UIR | ⏳ to compute | From the position and the published FIR boundaries (e.g. Lisboa LPPC, Madrid LECM, Santa Maria Oceanic LPPO) |
| Actual departure / arrival time | ⏳ partially | Computed from the stored positions (take-off and landing detection); reliable for LPPR (US14), approximate elsewhere |
| Scheduled departure / arrival time | ❌ no free source | Requires a schedule provider (e.g. AeroDataBox, aviationstack), with restrictive free quotas |
| GPS (geometric) altitude | ❌ not received | Needs `alt_geom` (readsb / dump1090-fa) |
| True airspeed, indicated airspeed, Mach | ❌ not received | Comm-B BDS 5,0 / 6,0 |
| Wind, temperature | ❌ not received | Comm-B BDS 4,4, or derived from true airspeed, heading and ground speed |

## Acceptance Criteria (proposed)

- The aircraft panel shows every field marked available, plus country of registration, FIR and latitude/longitude.
- Fields without data are omitted rather than shown empty.
- The panel states the source of each group of data.

## Open Decisions

- Whether the course receiver can be upgraded to readsb with Comm-B decoding, which would provide GPS altitude, airspeeds, Mach, wind and temperature without leaving the single-receiver principle.
- Whether an external live source (community aggregators) is acceptable for those fields, given that all positions must come from the course receiver.
- Whether a schedule provider's free quota is enough for scheduled times, or they remain out of scope.

## Diagrams

- SSD and SD to be produced when the story is planned.
