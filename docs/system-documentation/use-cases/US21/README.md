# US21 — Interface in English and Portuguese

**Epic:** E5 · **Priority:** S · **SP:** 2 · **Status:** ✅ brought forward to the end of Sprint 1

## User Story

> As a user, I want to use the application in English or Portuguese.

## Acceptance Criteria

- The title block has an EN / PT switch (in its settings section); the choice is remembered on the device and, on the first visit, follows the browser language.
- Every interface text (labels, status messages, errors) exists in both languages; the Portuguese dictionary is typed as complete, so a text added without its translation fails the type check.
- Data from the receiver and the external sources (callsigns, airline and airport names, aircraft types) is shown as received, in both languages.
- Numbers keep aeronautical units (feet, knots, degrees) in both languages.

## Design Rationale

- All texts live in one dictionary per language (`app/src/i18n.tsx`), keyed by meaning (for example `panel.groundSpeed`), so a missing translation is visible in a single place.
- Portuguese (Portugal) is used; aviation terms commonly used in English in Portugal are kept (callsign, squawk, Mach).

## Diagrams

- Cross-cutting requirement (no dedicated SSD).
