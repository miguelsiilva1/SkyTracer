/**
 * Tracker: the always-on core of SkyTracer.
 *
 * A loop runs every POLL_INTERVAL: it reads aircraft.json, updates the live state (kept in
 * memory), reads one adsb.fi area in turn (each refreshed every NETWORK_INTERVAL), enriches one aircraft or route,
 * flushes the buffered history to Supabase every FLUSH_INTERVAL and pushes the live state to the
 * WebSocket clients. The API answers live data from memory and history from Supabase, so it keeps
 * working (last known state and history) even if the receiver or the external APIs fail.
 *
 * Every live aircraft carries its `source`: "receiver" (the course receiver in Porto) or
 * "adsb.fi" (seen only by the network, shown live and never stored). Receiver aircraft may also
 * carry `extra` parameters from adsb.fi, labelled with `extra_source`.
 */
import type { WebSocket } from "ws";
import { Collector, type LiveAircraft } from "./collector";
import type { Config } from "./config";
import { type AircraftState, parseSnapshot } from "./dump1090";
import { Enricher } from "./enrichment/enricher";
import { ApiGate } from "./enrichment/http";
import { hasExtra, NETWORK_NAME, type NetworkAircraft, parseNetwork } from "./network";
import { inList, Supabase } from "./supabase";

const ADSBDB_URL = "https://api.adsbdb.com/v0";
const PLANESPOTTERS_URL = "https://api.planespotters.net/pub/photos";
const LIVE_MAX_AGE_S = 60;
const FETCH_TIMEOUT_MS = 5_000;
const WS_MAX_BUFFERED_BYTES = 1_000_000; // a client this far behind is dropped
const VIEW_REPLY_INTERVAL_MS = 1000;

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

export class Tracker {
	private readonly db: Supabase;
	private readonly collector: Collector;
	private readonly enricher: Enricher;
	private lastFlush = 0;
	private lastRead: number | null = null;
	private network = new Map<string, NetworkAircraft>();
	private readonly areas = new Map<string, NetworkAircraft[]>(); // last snapshot of each adsb.fi area
	private nextArea = 0;
	private lastNetworkRead: number | null = null;
	private lastNetworkAttempt = 0;
	private readonly clients = new Map<WebSocket, View | null>();
	private timer: ReturnType<typeof setTimeout> | undefined;
	private running = false;

	constructor(private readonly cfg: Config) {
		this.db = new Supabase(this.cfg.supabaseUrl, this.cfg.supabaseKey);
		this.collector = new Collector({
			positionMinIntervalMs: this.cfg.positionMinIntervalMs,
			snapshotIntervalMs: this.cfg.flushIntervalMs,
			liveExpiryMs: this.cfg.liveExpiryMs,
		});
		this.enricher = new Enricher(
			this.db,
			{ adsbdb: new ApiGate(this.cfg.userAgent), planespotters: new ApiGate(this.cfg.userAgent) },
			{
				adsbdbUrl: ADSBDB_URL,
				planespottersUrl: PLANESPOTTERS_URL,
				aircraftTtlMs: this.cfg.aircraftTtlMs,
				routeTtlMs: this.cfg.routeTtlMs,
			},
		);
	}

	/** Starts the loop: one tick every POLL_INTERVAL, never two at the same time. */
	start(): void {
		this.running = true;
		const run = async () => {
			const started = Date.now();
			try {
				await this.tick(started);
			} catch (err) {
				console.error(`tick failed: ${err}`);
			}
			// the next tick is always scheduled, so the loop survives any failure above
			if (this.running) this.timer = setTimeout(run, Math.max(0, this.cfg.pollIntervalMs - (Date.now() - started)));
		};
		this.timer = setTimeout(run, 0);
	}

	/** Stops the loop and writes the history still buffered. */
	async stop(): Promise<void> {
		this.running = false;
		clearTimeout(this.timer);
		for (const ws of this.clients.keys()) ws.close(1001);
		await this.flush();
	}

	/** One iteration of the loop (public for tests). */
	async tick(now: number): Promise<void> {
		try {
			const resp = await fetch(this.cfg.dump1090Url, {
				headers: { "User-Agent": this.cfg.userAgent },
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			});
			if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
			this.collector.ingest(parseSnapshot(await resp.json()));
			this.lastRead = now;
		} catch (err) {
			console.warn(`dump1090 read failed: ${err}`);
		}

		// one area per turn, so each is refreshed every NETWORK_INTERVAL and adsb.fi gets at most
		// one request per second
		const urls = this.cfg.networkUrls;
		if (urls.length && now - this.lastNetworkAttempt >= Math.max(1000, this.cfg.networkIntervalMs / urls.length)) {
			this.lastNetworkAttempt = now;
			const url = urls[this.nextArea++ % urls.length]!;
			await this.readNetwork(url, now);
		}

		try {
			const networkOnly = [...this.network.values()].map((n) => n.state).filter((s) => !this.collector.live.has(s.hex));
			await this.enricher.step(this.collector.live.values(), now, networkOnly);
		} catch (err) {
			console.warn(`enrichment failed: ${err}`);
		}

		if (now - this.lastFlush >= this.cfg.flushIntervalMs) {
			this.lastFlush = now;
			await this.flush();
		}

		if (this.clients.size) {
			const all = this.liveAircraft(LIVE_MAX_AGE_S, now);
			const full = JSON.stringify({ ts: iso(now), aircraft: all });
			for (const [ws, view] of this.clients) {
				if (ws.bufferedAmount > WS_MAX_BUFFERED_BYTES) ws.terminate();
				else ws.send(view ? JSON.stringify({ ts: iso(now), aircraft: inView(all, view) }) : full);
			}
		}
	}

	/**
	 * Registers a WebSocket client of /ws/live and sends it the current state right away. A client
	 * may send `{"bbox": [west, south, east, north], "keep": [hex]}`: it then receives every receiver
	 * aircraft but only the network aircraft inside that area (and those in `keep`).
	 */
	addClient(ws: WebSocket): void {
		this.clients.set(ws, null);
		ws.on("close", () => this.clients.delete(ws));
		ws.on("error", () => this.clients.delete(ws));
		let lastReply = 0;
		ws.on("message", (data) => {
			const view = parseView(String(data));
			if (!view || !this.clients.has(ws)) return;
			this.clients.set(ws, view);
			// answer a new area right away at most once per second; otherwise the next tick does it
			const now = Date.now();
			if (now - lastReply < VIEW_REPLY_INTERVAL_MS) return;
			if (ws.bufferedAmount > WS_MAX_BUFFERED_BYTES) return void ws.terminate();
			lastReply = now;
			ws.send(JSON.stringify({ ts: iso(now), aircraft: inView(this.liveAircraft(LIVE_MAX_AGE_S, now), view) }));
		});
		ws.send(this.liveMessage(Date.now()));
	}

	/** Replaces the snapshot of one area and merges all areas; on failure the old one simply ages out. */
	private async readNetwork(url: string, now: number): Promise<void> {
		try {
			const resp = await fetch(url, {
				headers: { "User-Agent": this.cfg.userAgent },
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			});
			if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
			const { aircraft } = parseNetwork(await resp.json());
			this.areas.set(url, aircraft);
			// areas overlap: an aircraft seen in several keeps its most recent state
			const merged = new Map<string, NetworkAircraft>();
			for (const list of this.areas.values())
				for (const n of list) {
					const old = merged.get(n.state.hex);
					if (!old || n.state.ts > old.state.ts) merged.set(n.state.hex, n);
				}
			this.network = merged;
			this.lastNetworkRead = now;
		} catch (err) {
			console.warn(`${NETWORK_NAME} read failed: ${err}`);
		}
	}

	/** Writes the buffered history to Supabase; on failure it is kept for the next flush. */
	async flush(): Promise<void> {
		const batch = this.collector.takeBatch();
		if (!batch) return;
		try {
			await this.db.rpc("record_batch", {
				p_aircraft: batch.aircraft,
				p_positions: batch.positions,
				p_snapshots: batch.snapshots,
			});
		} catch (err) {
			console.error(`history flush failed: ${err}`);
			this.collector.restore(batch);
		}
	}

	// --- API --------------------------------------------------------------------------

	/**
	 * Live aircraft with a recent position, with enrichment and route. The course receiver has
	 * priority: its aircraft come first and always keep its position; then come the aircraft
	 * positioned only by the adsb.fi network.
	 */
	liveAircraft(maxAgeS: number, now: number) {
		const minPos = now - maxAgeS * 1000;
		const fresh = (posAt: number | null, lat: number | null) => lat !== null && posAt !== null && posAt > minPos;
		const receiver = [...this.collector.live.values()].filter((a) => fresh(a.posAt, a.lat));
		const shown = new Set(receiver.map((a) => a.hex));
		const network = [...this.network.values()].filter((n) => !shown.has(n.state.hex) && fresh(n.state.posTs, n.state.lat));
		const byHex = <T extends { hex: string }>(a: T, b: T) => a.hex.localeCompare(b.hex);
		return [
			...receiver.sort(byHex).map((a) => this.present(a, "receiver")),
			...network.map((n) => fromNetwork(n.state)).sort(byHex).map((l) => this.present(l, NETWORK_NAME)),
		];
	}

	private present(l: LiveAircraft, source: "receiver" | typeof NETWORK_NAME, n = this.network.get(l.hex)) {
		const e = this.enricher.aircraft.get(l.hex);
		const r = l.callsign ? this.enricher.routes.get(l.callsign) : null;
		const route = r && r.status === "ok" ? r : null;
		const extra = n && hasExtra(n.extra) ? n.extra : null;
		return {
			hex: l.hex,
			source,
			callsign: l.callsign,
			lat: l.lat,
			lon: l.lon,
			altitude_ft: l.altitudeFt,
			on_ground: l.onGround,
			speed_kt: l.speedKt,
			track_deg: l.trackDeg,
			vert_rate_fpm: l.vertRateFpm,
			squawk: l.squawk,
			category: l.category,
			rssi_dbfs: l.rssiDbfs,
			mlat: l.mlat,
			seen_at: iso(l.seenAt),
			pos_at: iso(l.posAt),
			registration: e?.registration ?? n?.registration ?? null,
			icao_type: e?.icao_type ?? n?.icao_type ?? null,
			type_name: e?.type_name ?? n?.type_name ?? null,
			manufacturer: e?.manufacturer ?? null,
			operator: e?.operator ?? null,
			country: e?.country ?? null,
			photo_url: e?.photo_url ?? null,
			photo_credit: e?.photo_credit ?? null,
			photo_link: e?.photo_link ?? null,
			airline_name: route?.airline_name ?? null,
			airline_icao: route?.airline_icao ?? null,
			airline_iata: route?.airline_iata ?? null,
			origin_icao: route?.origin_icao ?? null,
			origin_iata: route?.origin_iata ?? null,
			origin_name: route?.origin_name ?? null,
			origin_lat: route?.origin_lat ?? null,
			origin_lon: route?.origin_lon ?? null,
			dest_icao: route?.dest_icao ?? null,
			dest_iata: route?.dest_iata ?? null,
			dest_name: route?.dest_name ?? null,
			dest_lat: route?.dest_lat ?? null,
			dest_lon: route?.dest_lon ?? null,
			extra,
			extra_source: extra ? NETWORK_NAME : null,
		};
	}

	private liveMessage(now: number): string {
		return JSON.stringify({ ts: iso(now), aircraft: this.liveAircraft(LIVE_MAX_AGE_S, now) });
	}

	/**
	 * Stored positions (course receiver only) from `from` − 60 s to `from` + `minutes` (US12), with
	 * the identification of those aircraft and the routes of their callsigns, so the app can rebuild
	 * the airspace at any instant of the window: the last position of each aircraft in the 60 s before it.
	 */
	private async replay(from: number, minutes: number) {
		const since = new Date(from - LIVE_MAX_AGE_S * 1000).toISOString();
		const until = new Date(from + minutes * 60_000).toISOString();
		const positions = await this.db.selectAll<{ hex: string; callsign: string | null }>(
			"position",
			`select=hex,ts,callsign,lat,lon,altitude_ft,on_ground,speed_kt,track_deg,vert_rate_fpm,squawk,mlat&ts=gte.${since}&ts=lt.${until}&order=ts`,
		);
		const hexes = [...new Set(positions.map((p) => p.hex))];
		const callsigns = [...new Set(positions.map((p) => p.callsign).filter((c): c is string => Boolean(c)))];
		const [aircraft, routes] = await Promise.all([
			hexes.length ? this.db.selectAll("aircraft", `select=${REPLAY_AIRCRAFT}&hex=in.${inList(hexes)}`) : [],
			callsigns.length ? this.db.selectAll("flight_route", `select=${REPLAY_ROUTE}&status=eq.ok&callsign=in.${inList(callsigns)}`) : [],
		]);
		return { from: new Date(from).toISOString(), until, positions, aircraft, routes };
	}

	/** Answers the REST routes (the WebSocket route is handled by the server). */
	async handle(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const now = Date.now();
		const path = url.pathname;

		if (path === "/health") {
			return Response.json({
				status: "ok",
				last_read: iso(this.lastRead),
				aircraft_live: this.collector.live.size,
				network: { source: NETWORK_NAME, last_read: iso(this.lastNetworkRead), aircraft: this.network.size },
			});
		}

		if (path === "/ws/live") return new Response("Expected WebSocket", { status: 426 });

		if (path === "/aircraft/live") {
			const maxAge = intParam(url, "max_age_seconds", LIVE_MAX_AGE_S, 1, 300);
			if (maxAge === null) return invalid("max_age_seconds must be an integer between 1 and 300");
			return Response.json(this.liveAircraft(maxAge, now));
		}

		if (path === "/replay") {
			const from = Date.parse(url.searchParams.get("from") ?? "");
			if (!Number.isFinite(from)) return invalid("from must be an ISO 8601 timestamp");
			const minutes = intParam(url, "minutes", 10, 1, 15);
			if (minutes === null) return invalid("minutes must be an integer between 1 and 15");
			return Response.json(await this.replay(from, minutes));
		}

		const match = path.match(/^\/aircraft\/([^/]+)(\/track)?$/);
		if (match) {
			const hex = (match[1] ?? "").toLowerCase();
			if (!/^[0-9a-f]{6}$/.test(hex)) return invalid("hex must be 6 hexadecimal characters");
			if (match[2]) {
				const minutes = intParam(url, "minutes", 60, 1, 1440);
				if (minutes === null) return invalid("minutes must be an integer between 1 and 1440");
				const since = new Date(now - minutes * 60_000).toISOString();
				return Response.json(
					await this.db.select(
						"position",
						`select=ts,lat,lon,altitude_ft,speed_kt,track_deg,on_ground&hex=eq.${hex}&ts=gt.${since}&order=ts`,
					),
				);
			}
			const rows = await this.db.select<Record<string, unknown>>(
				"aircraft",
				`select=hex,registration,icao_type,type_name,manufacturer,operator,country,category,photo_url,photo_credit,photo_link,enrich_status,enriched_at,first_seen,last_seen&hex=eq.${hex}`,
			);
			const live = this.collector.live.get(hex);
			if (!rows.length) {
				// aircraft seen only by the network: nothing is stored about it
				const n = !live ? this.network.get(hex) : undefined;
				if (n) return Response.json({ hex, source: NETWORK_NAME, live: this.present(fromNetwork(n.state), NETWORK_NAME, n) });
				return Response.json({ detail: "Unknown aircraft" }, { status: 404 });
			}
			return Response.json({ ...rows[0], live: live ? this.present(live, "receiver") : null });
		}

		return Response.json({ detail: "Not found" }, { status: 404 });
	}
}

const REPLAY_AIRCRAFT = "hex,registration,icao_type,type_name,manufacturer,operator,country,photo_url,photo_credit,photo_link";
const REPLAY_ROUTE =
	"callsign,airline_name,airline_icao,airline_iata,origin_icao,origin_iata,origin_name,origin_lat,origin_lon,dest_icao,dest_iata,dest_name,dest_lat,dest_lon";

/** Area of the map a WebSocket client is showing, and aircraft it always wants (the selected one). */
interface View {
	west: number;
	south: number;
	east: number;
	north: number;
	keep: Set<string>;
}

const HEX = /^[0-9a-f]{6}$/;

function parseView(text: string): View | null {
	try {
		const { bbox, keep } = JSON.parse(text) as { bbox?: unknown; keep?: unknown };
		if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every((v) => typeof v === "number" && Number.isFinite(v))) return null;
		const [west, south, east, north] = bbox as number[];
		const hexes = Array.isArray(keep) ? keep.filter((h): h is string => typeof h === "string" && HEX.test(h)).slice(0, 10) : [];
		return { west: west!, south: south!, east: east!, north: north!, keep: new Set(hexes) };
	} catch {
		return null;
	}
}

/** Receiver aircraft always; network aircraft only inside the view (or kept). */
function inView<T extends { hex: string; source: string; lat: number | null; lon: number | null }>(list: T[], v: View): T[] {
	return list.filter((a) => {
		if (a.source === "receiver" || v.keep.has(a.hex)) return true;
		if (a.lat === null || a.lon === null || a.lat < v.south || a.lat > v.north) return false;
		return v.west <= v.east ? a.lon >= v.west && a.lon <= v.east : a.lon >= v.west || a.lon <= v.east; // across 180°
	});
}

/** Live-state view of an aircraft known only from the network. */
function fromNetwork(s: AircraftState): LiveAircraft {
	return {
		hex: s.hex,
		seenAt: s.ts,
		posAt: s.posTs,
		callsign: s.callsign,
		lat: s.lat,
		lon: s.lon,
		altitudeFt: s.altitudeFt,
		onGround: s.onGround,
		speedKt: s.speedKt,
		trackDeg: s.trackDeg,
		vertRateFpm: s.vertRateFpm,
		squawk: s.squawk,
		category: s.category,
		rssiDbfs: null, // signal strength refers to the course receiver only
		mlat: s.mlat,
	};
}

function intParam(url: URL, name: string, fallback: number, min: number, max: number): number | null {
	const raw = url.searchParams.get(name);
	if (raw === null) return fallback;
	const n = Number(raw);
	return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function invalid(detail: string): Response {
	return Response.json({ detail }, { status: 422 });
}
