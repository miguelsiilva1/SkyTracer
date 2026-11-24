/**
 * adsb.fi open data: aircraft received by the adsb.fi community network within 250 NM of Porto.
 *
 * Used only to show, live, aircraft beyond the reach of the course receiver and the flight
 * parameters it does not decode (GPS altitude, airspeeds, Mach, wind, temperature). Nothing from
 * this source is stored: history, replay and coverage use the course receiver only. Terms: personal,
 * non-commercial use, at most one request per second, and adsb.fi must be credited with a link
 * (https://adsb.fi).
 */
import { type AircraftState, parseAircraft } from "./dump1090";

export const NETWORK_NAME = "adsb.fi";

/** Parameters decoded by the network that the course receiver does not export. */
export interface NetworkExtra {
	alt_geom_ft: number | null;
	tas_kt: number | null;
	ias_kt: number | null;
	mach: number | null;
	wind_dir_deg: number | null;
	wind_speed_kt: number | null;
	oat_c: number | null;
}

export interface NetworkAircraft {
	state: AircraftState;
	registration: string | null;
	icao_type: string | null;
	type_name: string | null;
	extra: NetworkExtra;
}

type Raw = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function parseNetwork(payload: unknown): { now: number; aircraft: NetworkAircraft[] } {
	const p = (payload && typeof payload === "object" ? payload : {}) as Raw;
	const now = num(p.now) ?? Date.now(); // v3 sends milliseconds
	const list = Array.isArray(p.ac) ? (p.ac as Raw[]) : [];
	const aircraft: NetworkAircraft[] = [];
	for (const raw of list) {
		const state = parseAircraft(raw, now);
		if (!state) continue;
		aircraft.push({
			state,
			registration: str(raw.r),
			icao_type: str(raw.t),
			type_name: str(raw.desc),
			extra: {
				alt_geom_ft: num(raw.alt_geom),
				tas_kt: num(raw.tas),
				ias_kt: num(raw.ias),
				mach: num(raw.mach),
				wind_dir_deg: num(raw.wd),
				wind_speed_kt: num(raw.ws),
				oat_c: num(raw.oat),
			},
		});
	}
	return { now, aircraft };
}

export function hasExtra(e: NetworkExtra): boolean {
	return Object.values(e).some((v) => v !== null);
}
