/**
 * Search (US09) and quick filters (US08) over the live aircraft. Everything runs in the app on
 * the live state, so the result follows every WebSocket update.
 *
 * The search takes keywords separated by spaces; an aircraft matches when every keyword appears
 * in one of its fields: callsign, registration, ICAO address, airline, aircraft type, operator,
 * origin or destination airport, or squawk. Keywords therefore also filter by airport, airline
 * and type (for example "LPPR A320").
 */
import type { LiveAircraft } from "./types";

/** ground; low: below 10,000 ft; mid: 10,000 to 30,000 ft; high: above 30,000 ft. */
export type AltitudeBand = "all" | "ground" | "low" | "mid" | "high";

export interface Filters {
	query: string;
	altitude: AltitudeBand;
	emergency: boolean;
	withRoute: boolean;
}

export const NO_FILTERS: Filters = { query: "", altitude: "all", emergency: false, withRoute: false };

const EMERGENCY_SQUAWKS = new Set(["7500", "7600", "7700"]);
const HEX = /^[0-9a-f]{6}$/;

export function keywords(query: string): string[] {
	return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/** A single keyword that is an ICAO address: it can be looked up even when not received now. */
export function hexQuery(query: string): string | null {
	const k = keywords(query);
	return k.length === 1 && HEX.test(k[0]!) ? k[0]! : null;
}

function searchable(a: LiveAircraft): string[] {
	return [
		a.callsign, a.registration, a.hex, a.squawk,
		a.airline_icao, a.airline_iata, a.airline_name, a.operator,
		a.icao_type, a.type_name, a.manufacturer,
		a.origin_icao, a.origin_iata, a.origin_name,
		a.dest_icao, a.dest_iata, a.dest_name,
	]
		.filter((v): v is string => Boolean(v))
		.map((v) => v.toLowerCase());
}

function inBand(a: LiveAircraft, band: AltitudeBand): boolean {
	if (band === "all") return true;
	if (band === "ground") return a.on_ground;
	if (a.on_ground || a.altitude_ft === null) return false; // unknown altitude is excluded
	if (band === "low") return a.altitude_ft < 10_000;
	if (band === "mid") return a.altitude_ft >= 10_000 && a.altitude_ft <= 30_000;
	return a.altitude_ft > 30_000;
}

/** Filters combine with a logical AND; aircraft lacking the filtered data are excluded. */
export function applyFilters(list: LiveAircraft[], f: Filters): LiveAircraft[] {
	const words = keywords(f.query);
	return list.filter((a) => {
		if (!inBand(a, f.altitude)) return false;
		if (f.emergency && !(a.squawk && EMERGENCY_SQUAWKS.has(a.squawk))) return false;
		if (f.withRoute && !(a.origin_icao || a.origin_iata || a.dest_icao || a.dest_iata)) return false;
		if (words.length) {
			const fields = searchable(a);
			if (!words.every((w) => fields.some((v) => v.includes(w)))) return false;
		}
		return true;
	});
}

export function isFiltering(f: Filters): boolean {
	return keywords(f.query).length > 0 || f.altitude !== "all" || f.emergency || f.withRoute;
}
