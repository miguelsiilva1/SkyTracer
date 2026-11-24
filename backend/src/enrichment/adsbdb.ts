/** adsbdb.com: aircraft data (by hex) and route (by callsign). Free, no key. */

export interface AircraftInfo {
	registration: string | null;
	icao_type: string | null;
	type_name: string | null;
	manufacturer: string | null;
	operator: string | null;
	country: string | null;
}

export interface RouteInfo {
	airline_name: string | null;
	airline_icao: string | null;
	airline_iata: string | null;
	origin_icao: string | null;
	origin_iata: string | null;
	origin_name: string | null;
	origin_lat: number | null;
	origin_lon: number | null;
	dest_icao: string | null;
	dest_iata: string | null;
	dest_name: string | null;
	dest_lat: number | null;
	dest_lon: number | null;
}

type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

/** `response.<key>` when it is an object (a 404 brings a string instead). */
function response(payload: unknown, key: string): Obj | null {
	return obj(obj(obj(payload)?.response)?.[key]);
}

export function parseAircraft(payload: unknown): AircraftInfo | null {
	const a = response(payload, "aircraft");
	if (!a) return null;
	return {
		registration: str(a.registration),
		icao_type: str(a.icao_type),
		type_name: str(a.type),
		manufacturer: str(a.manufacturer),
		operator: str(a.registered_owner),
		country: str(a.registered_owner_country_name),
	};
}

export function parseRoute(payload: unknown): RouteInfo | null {
	const r = response(payload, "flightroute");
	if (!r) return null;
	const airline = obj(r.airline) ?? {};
	const origin = obj(r.origin) ?? {};
	const dest = obj(r.destination) ?? {};
	return {
		airline_name: str(airline.name),
		airline_icao: str(airline.icao),
		airline_iata: str(airline.iata),
		origin_icao: str(origin.icao_code),
		origin_iata: str(origin.iata_code),
		origin_name: str(origin.name),
		origin_lat: num(origin.latitude),
		origin_lon: num(origin.longitude),
		dest_icao: str(dest.icao_code),
		dest_iata: str(dest.iata_code),
		dest_name: str(dest.name),
		dest_lat: num(dest.latitude),
		dest_lon: num(dest.longitude),
	};
}
