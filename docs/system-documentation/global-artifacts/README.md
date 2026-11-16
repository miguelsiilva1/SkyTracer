# Global Artefacts

| Artefact | Contents |
|---|---|
| [Glossary](glossary.md) | Domain terms, expressions and acronyms |
| [Supplementary Specification (FURPS+)](furps.md) | Non-functional requirements and constraints |
| [Domain Model](#1-domain-model-dm) | Conceptual model of the problem |
| [Class Diagram](#2-class-diagram-cd) | Backend classes and modules, as implemented |

## 1. Domain Model (DM)

Conceptual model of the problem: concepts, attributes and associations, independent of technology.
Concepts are grouped by package and colour; grey concepts belong to user stories that have not yet been implemented.

![Domain Model](svg/DM.svg)

Notes:

- **Aircraft** is the aggregate root: identification, photo and enrichment status only exist in association with an aircraft and are refreshed together.
- **Live State** and **Position** differ in purpose: the former is the latest observation (replaced on every read); the latter is historical (accumulated and subject to retention).
- **Route** is associated with the **Flight (Callsign)**, not with the aircraft, since the same aircraft operates several flights per day.

## 2. Class Diagram (CD)

Backend classes and modules (`backend/skytracer/`), with their attributes, operations and dependencies, as implemented.
Python modules containing only functions are shown with the `<<module>>` stereotype.

![Class Diagram](svg/CD.svg)

Notes:

- **From DM to CD:** domain concepts are not persistent classes (no ORM is used); they exist as PostgreSQL tables and as immutable *dataclasses* that carry data between layers (`AircraftState`, `AircraftInfo`, `RouteInfo`, `Photo`).
- **Parsing separated from I/O:** `dump1090`, `adsbdb` and `planespotters` convert JSON into objects without side effects; network access is isolated in `RateLimitedClient` and database access in the service modules (`collector_main`, `worker`, `api_main`).
- **`Settings`** is the single source of configuration, shared by all services.
