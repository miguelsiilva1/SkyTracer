/**
 * Tracker Durable Object: the single always-on part of SkyTracer.
 *
 * An alarm fires every POLL_INTERVAL: it reads aircraft.json, updates the live state (kept in
 * memory), reads the adsb.fi network every NETWORK_INTERVAL, enriches one aircraft or route,
 * flushes the buffered history to Supabase every FLUSH_INTERVAL and pushes the live state to the
 * WebSocket clients. The API answers live data from memory and history from Supabase, so it keeps
 * working (last known state and history) even if the receiver or the external APIs fail.
 *
 * Every live aircraft carries its `source`: "receiver" (the course receiver in Porto) or
 * "adsb.fi" (seen only by the network, shown live and never stored). Receiver aircraft may also
 * carry `extra` parameters from adsb.fi, labelled with `extra_source`.
 */
import { DurableObject } from "cloudflare:workers";
import { Collector, type LiveAircraft } from "./collector";
import { type Config, loadConfig } from "./config";
import { type AircraftState, parseSnapshot } from "./dump1090";
import { Enricher } from "./enrichment/enricher";
import { ApiGate } from "./enrichment/http";
import { hasExtra, NETWORK_NAME, type NetworkAircraft, parseNetwork } from "./network";
import { Supabase } from "./supabase";

const ADSBDB_URL = "https://api.adsbdb.com/v0";
const PLANESPOTTERS_URL = "https://api.planespotters.net/pub/photos";
const LIVE_MAX_AGE_S = 60;
const FETCH_TIMEOUT_MS = 5_000;

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

export class Tracker extends DurableObject<Env> {
	private readonly cfg: Config;
	private readonly db: Supabase;
	private readonly collector: Collector;
	private readonly enricher: Enricher;
	private lastFlush = 0;
	private lastRead: number | null = null;
	private network = new Map<string, NetworkAircraft>();
	private lastNetworkRead: number | null = null;
	private lastNetworkAttempt = 0;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.cfg = loadConfig(env);
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
		// any access to the object (including the first request after a deploy) starts the loop
		ctx.blockConcurrencyWhile(async () => {
			if ((await ctx.storage.getAlarm()) === null) await ctx.storage.setAlarm(Date.now());
		});
	}

	async alarm(): Promise<void> {
		// schedule the next tick first, so the loop survives any failure below
		await this.ctx.storage.setAlarm(Date.now() + this.cfg.pollIntervalMs);
		await this.tick(Date.now());
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

		if (this.cfg.networkUrl && now - this.lastNetworkAttempt >= this.cfg.networkIntervalMs) {
			this.lastNetworkAttempt = now;
			await this.readNetwork(now);
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

		const sockets = this.ctx.getWebSockets();
		if (sockets.length) {
			const message = this.liveMessage(now);
			for (const ws of sockets) {
				try {
					ws.send(message);
				} catch {
					// closed meanwhile; the runtime removes it
				}
			}
		}
	}

	/** Replaces the network snapshot; on failure the previous one simply ages out. */
	private async readNetwork(now: number): Promise<void> {
		try {
			const resp = await fetch(this.cfg.networkUrl, {
				headers: { "User-Agent": this.cfg.userAgent },
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			});
			if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
			const { aircraft } = parseNetwork(await resp.json());
			this.network = new Map(aircraft.map((n) => [n.state.hex, n]));
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

	async fetch(request: Request): Promise<Response> {
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

		if (path === "/ws/live") {
			if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
			const { 0: client, 1: server } = new WebSocketPair();
			this.ctx.acceptWebSocket(server);
			server.send(this.liveMessage(now)); // current state right away
			return new Response(null, { status: 101, webSocket: client });
		}

		if (path === "/aircraft/live") {
			const maxAge = intParam(url, "max_age_seconds", LIVE_MAX_AGE_S, 1, 300);
			if (maxAge === null) return invalid("max_age_seconds must be an integer between 1 and 300");
			return Response.json(this.liveAircraft(maxAge, now));
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

	async webSocketMessage(): Promise<void> {
		// client messages are ignored
	}

	async webSocketClose(ws: WebSocket): Promise<void> {
		try {
			ws.close(1000);
		} catch {
			// already closed
		}
	}
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
