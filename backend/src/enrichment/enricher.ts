/**
 * Enrichment of the aircraft the receiver is currently seeing: aircraft data and photo
 * (adsbdb + planespotters) and the route of each callsign (adsbdb).
 *
 * Results are cached in the database (configurable TTL) and in memory. "Not found" is cached
 * too, so it is not requested again; errors are retried after one hour. At most one request
 * per API is made on each tick, which keeps well below one request per second per API.
 */
import type { LiveAircraft } from "../collector";
import { type Supabase, inList } from "../supabase";
import { type AircraftInfo, type RouteInfo, parseAircraft, parseRoute } from "./adsbdb";
import type { ApiGate, Fetched } from "./http";
import { type Photo, parsePhoto } from "./planespotters";

export type EnrichStatus = "ok" | "not_found" | "error";

export interface AircraftEnrichment extends AircraftInfo, Omit<Photo, "photo_url"> {
	hex: string;
	photo_url: string | null;
	enrich_status: EnrichStatus | null; // null = not enriched yet
	enriched_at: string | null;
}

export interface RouteEnrichment extends RouteInfo {
	callsign: string;
	status: EnrichStatus;
	fetched_at: string;
}

export interface EnricherOptions {
	adsbdbUrl: string;
	planespottersUrl: string;
	aircraftTtlMs: number;
	routeTtlMs: number;
}

export interface Apis {
	adsbdb: ApiGate;
	planespotters: ApiGate;
}

const ERROR_RETRY_MS = 3_600_000;
/** Temporary failures (429, 5xx, network) tolerated per item before it is cached as an error. */
const MAX_RETRIES = 4;
/** Keys per lookup in the database (keeps the URL short). */
const LOOKUP_BATCH = 100;

const AIRCRAFT_COLUMNS =
	"hex,registration,icao_type,type_name,manufacturer,operator,country,photo_url,photo_credit,photo_link,enrich_status,enriched_at";

const EMPTY_INFO: AircraftInfo = {
	registration: null,
	icao_type: null,
	type_name: null,
	manufacturer: null,
	operator: null,
	country: null,
};

const EMPTY_ROUTE: RouteInfo = {
	airline_name: null,
	airline_icao: null,
	airline_iata: null,
	origin_icao: null,
	origin_iata: null,
	origin_name: null,
	origin_lat: null,
	origin_lon: null,
	dest_icao: null,
	dest_iata: null,
	dest_name: null,
	dest_lat: null,
	dest_lon: null,
};

const pending = (hex: string): AircraftEnrichment => ({
	hex,
	...EMPTY_INFO,
	photo_url: null,
	photo_credit: null,
	photo_link: null,
	enrich_status: null,
	enriched_at: null,
});

function isDue(status: EnrichStatus | null, at: string | null, ttlMs: number, now: number): boolean {
	if (status === null || at === null) return true;
	return Date.parse(at) < now - (status === "error" ? ERROR_RETRY_MS : ttlMs);
}

export class Enricher {
	readonly aircraft = new Map<string, AircraftEnrichment>();
	readonly routes = new Map<string, RouteEnrichment | null>(); // null = no row in the database yet
	private readonly retries = new Map<string, number>();

	constructor(
		private readonly db: Supabase,
		private readonly apis: Apis,
		private readonly opts: EnricherOptions,
	) {}

	/** One pass: loads unknown keys from the database and makes at most one lookup per API. */
	async step(live: Iterable<LiveAircraft>, now: number): Promise<void> {
		const hexes: string[] = [];
		const callsigns = new Set<string>();
		for (const a of live) {
			hexes.push(a.hex);
			if (a.callsign) callsigns.add(a.callsign);
		}
		await this.loadCached(hexes, callsigns);

		const { adsbdb, planespotters } = this.apis;
		const hex = hexes.find((h) => {
			const a = this.aircraft.get(h);
			return a && isDue(a.enrich_status, a.enriched_at, this.opts.aircraftTtlMs, now);
		});
		if (hex) {
			if (adsbdb.ready(now) && planespotters.ready(now)) await this.enrichAircraft(hex, now);
			return;
		}
		const callsign = [...callsigns].find((c) => {
			const r = this.routes.get(c);
			return r === null || (r !== undefined && isDue(r.status, r.fetched_at, this.opts.routeTtlMs, now));
		});
		if (callsign && adsbdb.ready(now)) await this.enrichRoute(callsign, now);
	}

	private async loadCached(hexes: string[], callsigns: Set<string>): Promise<void> {
		const newHexes = hexes.filter((h) => !this.aircraft.has(h)).slice(0, LOOKUP_BATCH);
		if (newHexes.length) {
			const rows = await this.db.select<AircraftEnrichment>("aircraft", `select=${AIRCRAFT_COLUMNS}&hex=in.${inList(newHexes)}`);
			for (const h of newHexes) this.aircraft.set(h, pending(h));
			for (const r of rows) this.aircraft.set(r.hex.trim(), { ...r, hex: r.hex.trim() });
		}
		const newCallsigns = [...callsigns].filter((c) => !this.routes.has(c)).slice(0, LOOKUP_BATCH);
		if (newCallsigns.length) {
			const rows = await this.db.select<RouteEnrichment>("flight_route", `select=*&callsign=in.${inList(newCallsigns)}`);
			for (const c of newCallsigns) this.routes.set(c, null);
			for (const r of rows) this.routes.set(r.callsign, r);
		}
	}

	/** Returns the final status, or null when the lookup will be retried on a later tick. */
	private settle(key: string, results: Fetched[]): EnrichStatus | null {
		if (results.some((r) => r.kind === "error")) return "error";
		if (results.some((r) => r.kind === "retry")) {
			const n = (this.retries.get(key) ?? 0) + 1;
			if (n < MAX_RETRIES) {
				this.retries.set(key, n);
				return null;
			}
			this.retries.delete(key);
			return "error";
		}
		this.retries.delete(key);
		return "ok";
	}

	private async enrichAircraft(hex: string, now: number): Promise<void> {
		const info = await this.apis.adsbdb.getJson(`${this.opts.adsbdbUrl}/aircraft/${hex}`, now);
		const photo = await this.apis.planespotters.getJson(`${this.opts.planespottersUrl}/hex/${hex}`, now);
		let status = this.settle(`a:${hex}`, [info, photo]);
		if (status === null) return;

		const row = pending(hex);
		if (status === "ok") {
			const parsedInfo = info.kind === "ok" ? parseAircraft(info.data) : null;
			const parsedPhoto = photo.kind === "ok" ? parsePhoto(photo.data) : null;
			Object.assign(row, parsedInfo ?? {}, parsedPhoto ?? {});
			if (!parsedInfo && !parsedPhoto) status = "not_found";
		}
		row.enrich_status = status;
		row.enriched_at = new Date(now).toISOString();
		await this.db.rpc("save_aircraft_enrichment", { p: row });
		// keep values already known when this lookup brought nothing new (same as the database)
		const prev = this.aircraft.get(hex);
		const merged = { ...row };
		for (const k of Object.keys(row) as (keyof AircraftEnrichment)[]) {
			if (merged[k] === null && prev?.[k] != null) (merged as any)[k] = prev[k];
		}
		this.aircraft.set(hex, merged);
	}

	private async enrichRoute(callsign: string, now: number): Promise<void> {
		const result = await this.apis.adsbdb.getJson(`${this.opts.adsbdbUrl}/callsign/${callsign}`, now);
		let status = this.settle(`r:${callsign}`, [result]);
		if (status === null) return;
		const route = status === "ok" && result.kind === "ok" ? parseRoute(result.data) : null;
		if (status === "ok" && !route) status = "not_found";
		const row: RouteEnrichment = { callsign, ...EMPTY_ROUTE, ...route, status, fetched_at: new Date(now).toISOString() };
		await this.db.rpc("save_route", { p: row });
		this.routes.set(callsign, row);
	}
}
