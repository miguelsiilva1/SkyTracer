import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { loadConfig } from "../src/config";
import { handle, startServer } from "../src/server";
import { Tracker } from "../src/tracker";
import adsbdbAircraft from "./fixtures/adsbdb_aircraft.json";
import adsbdbCallsign from "./fixtures/adsbdb_callsign.json";
import planespottersPhotos from "./fixtures/planespotters_photos.json";
import { mockFetch } from "./helpers";

let rpcs: { fn: string; body: any }[];
let selects: URL[];
let positions: object[];
let t: Tracker;

const cfg = loadConfig({
	SUPABASE_URL: "https://supabase.test",
	SUPABASE_SECRET_KEY: "test-key",
	HTTP_USER_AGENT: "SkyTracer/test",
	// the adsb.fi network source is enabled by default
});

function receiver() {
	return {
		now: Date.now() / 1000,
		messages: 42,
		aircraft: [
			{ hex: "4d00f1", flight: "LGL32PR ", lat: 41.37, lon: -8.55, altitude: 13425, seen: 0, seen_pos: 0, category: "A3", mlat: [] },
			{ hex: "49004b", altitude: "ground", seen: 2 },
		],
	};
}

function network() {
	return {
		now: Date.now(),
		ac: [
			// also seen by the receiver: contributes only extra parameters
			{ hex: "4d00f1", flight: "LGL32PR ", lat: 41.4, lon: -8.6, alt_baro: 13400, alt_geom: 13850, tas: 410, ias: 300, mach: 0.65, wd: 250, ws: 30, oat: -12, seen: 0, seen_pos: 0 },
			// seen only by the network
			{ hex: "3c6589", flight: "DLH1170 ", r: "D-AIUA", t: "A320", desc: "AIRBUS A-320", lat: 43.1, lon: -5.2, alt_baro: 37000, gs: 450, track: 30, seen: 0, seen_pos: 1 },
		],
	};
}

beforeEach(() => {
	rpcs = [];
	selects = [];
	positions = [];
	t = new Tracker(cfg);
	mockFetch(async (url, init) => {
		if (url.hostname === "ads-b.jcboliveira.xyz") return Response.json(receiver());
		if (url.hostname === "opendata.adsb.fi") return Response.json(network());
		if (url.hostname === "supabase.test") {
			const name = url.pathname.replace("/rest/v1/", "");
			if (name.startsWith("rpc/")) {
				rpcs.push({ fn: name.slice(4), body: JSON.parse(String(init?.body)) });
				return new Response(null, { status: 204 });
			}
			selects.push(url);
			if (name === "position") return Response.json(positions);
			if (name === "aircraft" && url.searchParams.get("hex") === "eq.4d00f1")
				return Response.json([{ hex: "4d00f1", registration: "LX-LBR", first_seen: "2026-11-24T10:00:00+00:00" }]);
			return Response.json([]);
		}
		if (url.pathname.endsWith("/aircraft/4d00f1")) return Response.json(adsbdbAircraft);
		if (url.pathname.endsWith("/callsign/LGL32PR")) return Response.json(adsbdbCallsign);
		if (url.pathname.endsWith("/hex/4d00f1")) return Response.json(planespottersPhotos);
		return Response.json({ response: "unknown" }, { status: 404 });
	});
});

afterEach(() => vi.restoreAllMocks());

const get = (path: string) => t.handle(new Request(`https://api${path}`));

async function tick(times = 1) {
	for (let i = 0; i < times; i++) await t.tick(Date.now() + i * 3000);
}

describe("Tracker", () => {
	it("collects, enriches and flushes the history to Supabase", async () => {
		await tick(2);

		const batch = rpcs.find((r) => r.fn === "record_batch")!.body;
		expect(batch.p_aircraft.map((a: any) => a.hex).sort()).toEqual(["49004b", "4d00f1"]);
		expect(batch.p_positions).toHaveLength(1);
		expect(batch.p_snapshots[0]).toMatchObject({ messages_total: 42, aircraft_total: 2, aircraft_with_pos: 1 });
		expect(rpcs.some((r) => r.fn === "save_aircraft_enrichment" && r.body.p.registration === "LX-LBR")).toBe(true);

		const live = (await (await get("/aircraft/live")).json()) as any[];
		const own = live.filter((a) => a.source === "receiver");
		expect(own.map((a) => a.hex)).toEqual(["4d00f1"]); // without position it is not on the map
		expect(own[0]).toMatchObject({ callsign: "LGL32PR", registration: "LX-LBR", operator: "Luxair", photo_credit: "Tomas Scheffer" });
	});

	it("reports the loop status on /health", async () => {
		await tick();
		const health = (await (await get("/health")).json()) as any;
		expect(health).toMatchObject({ status: "ok", aircraft_live: 2 });
		expect(health.last_read).not.toBeNull();
	});

	it("serves aircraft details and tracks from Supabase", async () => {
		await tick();
		const detail = (await (await get("/aircraft/4D00F1")).json()) as any;
		expect(detail.registration).toBe("LX-LBR");
		expect(detail.live.callsign).toBe("LGL32PR");
		expect((await get("/aircraft/abcdef")).status).toBe(404);
		expect((await get("/aircraft/xyz")).status).toBe(422);

		positions = [{ ts: "2026-11-24T10:00:00+00:00", lat: 41, lon: -8 }];
		const track = await get("/aircraft/4d00f1/track?minutes=30");
		expect(await track.json()).toEqual(positions);
		const q = selects.at(-1)!;
		expect(q.searchParams.get("hex")).toBe("eq.4d00f1");
		expect(q.searchParams.get("order")).toBe("ts");
		expect((await get("/aircraft/4d00f1/track?minutes=5000")).status).toBe(422);
	});

	it("keeps the batch when Supabase is down and retries on the next flush", async () => {
		vi.restoreAllMocks();
		let down = true;
		mockFetch(async (url, init) => {
			if (url.hostname === "ads-b.jcboliveira.xyz") return Response.json(receiver());
			if (url.pathname === "/rest/v1/rpc/record_batch") {
				if (down) return new Response("unavailable", { status: 503 });
				rpcs.push({ fn: "record_batch", body: JSON.parse(String(init?.body)) });
				return new Response(null, { status: 204 });
			}
			return Response.json([]);
		});
		await t.tick(Date.now());
		expect(rpcs).toHaveLength(0);
		down = false;
		await t.flush();
		expect(rpcs).toHaveLength(1);
		expect(rpcs[0]!.body.p_positions).toHaveLength(1);
	});

	it("streams the live state over WebSocket", async () => {
		await tick();
		const server = startServer(t, cfg, 0);
		await new Promise((resolve) => server.once("listening", resolve));
		const ws = new WebSocket(`ws://localhost:${(server.address() as AddressInfo).port}/ws/live`);
		const msg = await new Promise<any>((resolve) => ws.once("message", (data) => resolve(JSON.parse(String(data)))));
		// the course receiver comes first
		expect(msg.aircraft.map((a: any) => `${a.hex}:${a.source}`)).toEqual(["4d00f1:receiver", "3c6589:adsb.fi"]);
		ws.close();
		server.close();
	});

	it("sends each WebSocket client only the network aircraft in its view", async () => {
		await tick();
		const server = startServer(t, cfg, 0);
		await new Promise((resolve) => server.once("listening", resolve));
		const ws = new WebSocket(`ws://localhost:${(server.address() as AddressInfo).port}/ws/live`);
		const next = () => new Promise<any>((resolve) => ws.once("message", (data) => resolve(JSON.parse(String(data)))));
		const sources = (msg: any) => msg.aircraft.map((a: any) => a.hex).sort();

		expect(sources(await next())).toEqual(["3c6589", "4d00f1"]); // no view yet: everything
		ws.send(JSON.stringify({ bbox: [-9.5, 40.5, -7.5, 42] })); // around Porto
		expect(sources(await next())).toEqual(["4d00f1"]); // the network aircraft at 43.1, -5.2 is outside
		ws.send(JSON.stringify({ bbox: [-9.5, 40.5, -7.5, 42], keep: ["3c6589"] })); // but it is selected
		await new Promise((resolve) => setTimeout(resolve, 100));
		await tick(); // a second area within a second is applied on the next tick, not answered at once
		expect(sources(await next())).toEqual(["3c6589", "4d00f1"]);
		ws.send("not json"); // ignored
		ws.close();
		server.close();
	});

	it("runs the loop until stopped", async () => {
		t.start();
		await vi.waitFor(async () => expect(((await (await get("/health")).json()) as any).last_read).not.toBeNull());
		await t.stop();
		expect(rpcs.some((r) => r.fn === "record_batch")).toBe(true);
	});
});

describe("adsb.fi network", () => {
	it("adds network-only aircraft, labelled, without storing them", async () => {
		await tick();
		const live = (await (await get("/aircraft/live")).json()) as any[];
		const bySource = Object.fromEntries(live.map((a) => [a.hex, a.source]));
		expect(bySource).toEqual({ "4d00f1": "receiver", "3c6589": "adsb.fi" });

		const lh = live.find((a) => a.hex === "3c6589");
		expect(lh).toMatchObject({ registration: "D-AIUA", icao_type: "A320", rssi_dbfs: null });
		const own = live.find((a) => a.hex === "4d00f1");
		expect(own.extra).toMatchObject({ alt_geom_ft: 13850, tas_kt: 410, mach: 0.65, wind_dir_deg: 250, oat_c: -12 });
		expect(own.extra_source).toBe("adsb.fi");
		expect(own.lat).toBe(41.37); // position always from the receiver when it has one

		const batch = rpcs.find((r) => r.fn === "record_batch")!.body;
		expect(batch.p_aircraft.map((a: any) => a.hex)).not.toContain("3c6589");
		expect(batch.p_positions.map((p: any) => p.hex)).not.toContain("3c6589");
		expect(rpcs.some((r) => r.fn === "save_aircraft_enrichment" && r.body.p.hex === "3c6589")).toBe(false);

		const detail = (await (await get("/aircraft/3c6589")).json()) as any;
		expect(detail).toMatchObject({ source: "adsb.fi", live: { registration: "D-AIUA" } });
	});
});

describe("adsb.fi areas", () => {
	it("reads one area per turn and merges them", async () => {
		vi.restoreAllMocks();
		const requested = mockFetch(async (url) => {
			if (url.hostname === "ads-b.jcboliveira.xyz") return Response.json(receiver());
			if (url.hostname === "opendata.adsb.fi") {
				const madrid = url.pathname.includes("/lat/40.42/");
				const hex = madrid ? "34510f" : "3c6589";
				return Response.json({ now: Date.now(), ac: [{ hex, lat: madrid ? 40.4 : 43.1, lon: madrid ? -3.7 : -5.2, alt_baro: 30000, seen: 0, seen_pos: 0 }] });
			}
			return Response.json([]);
		});
		const two = new Tracker({ ...cfg, networkUrls: cfg.networkUrls.slice(0, 2), networkIntervalMs: 6000 });
		const now = Date.now();
		await two.tick(now);
		await two.tick(now + 3000);
		await two.tick(now + 4000); // too soon for the next area
		const areas = requested.filter((u) => u.hostname === "opendata.adsb.fi").map((u) => u.pathname);
		expect(areas).toHaveLength(2);
		expect(new Set(areas).size).toBe(2);
		const live = (await (await two.handle(new Request("https://api/aircraft/live"))).json()) as any[];
		expect(live.filter((a) => a.source === "adsb.fi").map((a) => a.hex).sort()).toEqual(["34510f", "3c6589"]);
	});
});

describe("Server", () => {
	it("adds CORS headers only for allowed origins", async () => {
		const allowed = await handle(new Request("https://api/health", { headers: { Origin: "https://miguelsiilva1.github.io" } }), t, cfg);
		expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe("https://miguelsiilva1.github.io");
		const other = await handle(new Request("https://api/health", { headers: { Origin: "https://evil.example" } }), t, cfg);
		expect(other.headers.get("Access-Control-Allow-Origin")).toBeNull();
		expect((await handle(new Request("https://api/health", { method: "POST" }), t, cfg)).status).toBe(405);
	});
});
