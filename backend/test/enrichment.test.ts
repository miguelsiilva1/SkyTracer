import { afterEach, describe, expect, it, vi } from "vitest";
import type { LiveAircraft } from "../src/collector";
import { parseAircraft, parseRoute } from "../src/enrichment/adsbdb";
import { Enricher } from "../src/enrichment/enricher";
import { ApiGate } from "../src/enrichment/http";
import { parsePhoto } from "../src/enrichment/planespotters";
import type { Supabase } from "../src/supabase";
import adsbdbAircraft from "./fixtures/adsbdb_aircraft.json";
import adsbdbCallsign from "./fixtures/adsbdb_callsign.json";
import planespottersPhotos from "./fixtures/planespotters_photos.json";
import { mockFetch } from "./helpers";

afterEach(() => vi.restoreAllMocks());

describe("parsers", () => {
	it("parses an adsbdb aircraft", () => {
		expect(parseAircraft(adsbdbAircraft)).toEqual({
			registration: "LX-LBR", icao_type: "B737", type_name: "737NG 7K2/W",
			manufacturer: "Boeing", operator: "Luxair", country: "Luxembourg",
		});
	});

	it("parses an adsbdb route", () => {
		const r = parseRoute(adsbdbCallsign)!;
		expect([r.airline_name, r.airline_icao, r.airline_iata]).toEqual(["Luxair", "LGL", "LG"]);
		expect([r.origin_icao, r.origin_iata]).toEqual(["LPPR", "OPO"]);
		expect(r.dest_icao).toBe("ELLX");
		expect(r.dest_lat).toBeCloseTo(49.62333);
	});

	it("returns null for unknown adsbdb answers", () => {
		expect(parseAircraft({ response: "unknown aircraft" })).toBeNull();
		expect(parseRoute({ response: "unknown callsign" })).toBeNull();
	});

	it("parses a planespotters photo", () => {
		const p = parsePhoto(planespottersPhotos)!;
		expect(p.photo_url.endsWith("_280.jpg")).toBe(true);
		expect(p.photo_credit).toBe("Tomas Scheffer");
		expect(p.photo_link!.startsWith("https://www.planespotters.net/photo/")).toBe(true);
		expect(parsePhoto({ photos: [] })).toBeNull();
	});
});

describe("ApiGate", () => {
	it("maps 404 to not_found and spaces requests", async () => {
		mockFetch(() => Response.json({ response: "unknown" }, { status: 404 }));
		const gate = new ApiGate("ua", 1000);
		expect(await gate.getJson("https://x/a", 0)).toEqual({ kind: "not_found" });
		expect(gate.ready(500)).toBe(false);
		expect(gate.ready(1000)).toBe(true);
	});

	it("backs off exponentially on 5xx and resets after a success", async () => {
		let status = 503;
		mockFetch(() => (status === 200 ? Response.json({ ok: 1 }) : new Response(null, { status })));
		const gate = new ApiGate("ua", 1, 1000);
		expect((await gate.getJson("https://x", 0)).kind).toBe("retry");
		expect(gate.ready(999)).toBe(false);
		expect((await gate.getJson("https://x", 1000)).kind).toBe("retry");
		expect(gate.ready(2999)).toBe(false); // 2 s after the second failure
		status = 200;
		expect(await gate.getJson("https://x", 3000)).toEqual({ kind: "ok", data: { ok: 1 } });
		expect(gate.ready(3001)).toBe(true);
	});

	it("respects Retry-After", async () => {
		mockFetch(() => new Response(null, { status: 429, headers: { "Retry-After": "7" } }));
		const gate = new ApiGate("ua", 1);
		await gate.getJson("https://x", 0);
		expect(gate.ready(6999)).toBe(false);
		expect(gate.ready(7000)).toBe(true);
	});

	it("treats network errors as temporary and other 4xx as permanent", async () => {
		mockFetch(() => {
			throw new TypeError("network down");
		});
		expect((await new ApiGate("ua").getJson("https://x", 0)).kind).toBe("retry");
		vi.restoreAllMocks();
		mockFetch(() => new Response(null, { status: 400 }));
		expect((await new ApiGate("ua").getJson("https://x", 0)).kind).toBe("error");
	});

	it("sends the User-Agent", async () => {
		const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({}));
		await new ApiGate("SkyTracer/test").getJson("https://x", 0);
		expect(new Headers(spy.mock.calls[0]![1]!.headers).get("User-Agent")).toBe("SkyTracer/test");
	});
});

// --- Enricher -------------------------------------------------------------------------

class FakeDb {
	aircraft: Record<string, any>[] = [];
	routes: Record<string, any>[] = [];
	calls: { fn: string; p: any }[] = [];
	async select<T>(table: string): Promise<T[]> {
		return (table === "aircraft" ? this.aircraft : this.routes) as T[];
	}
	async rpc(fn: string, args: { p: any }): Promise<null> {
		this.calls.push({ fn, p: args.p });
		return null;
	}
}

const live = (hex: string, callsign: string | null = null) => ({ hex, callsign }) as LiveAircraft;

const OPTS = {
	adsbdbUrl: "https://adsbdb.test/v0",
	planespottersUrl: "https://ps.test/photos",
	aircraftTtlMs: 30 * 86_400_000,
	routeTtlMs: 7 * 86_400_000,
};

function apis(status = 200) {
	return mockFetch((url) => {
		if (status !== 200) return new Response(null, { status });
		const p = url.pathname;
		if (p.endsWith("/aircraft/4d00f1")) return Response.json(adsbdbAircraft);
		if (p.endsWith("/callsign/LGL32PR")) return Response.json(adsbdbCallsign);
		if (p.endsWith("/hex/4d00f1")) return Response.json(planespottersPhotos);
		if (p.includes("/hex/")) return Response.json({ photos: [] });
		return Response.json({ response: "unknown" }, { status: 404 });
	});
}

function enricher(db: FakeDb) {
	return new Enricher(db as unknown as Supabase, { adsbdb: new ApiGate("ua", 1000), planespotters: new ApiGate("ua", 1000) }, OPTS);
}

describe("Enricher", () => {
	it("enriches the aircraft first and then its route", async () => {
		apis();
		const db = new FakeDb();
		const e = enricher(db);
		await e.step([live("4d00f1", "LGL32PR")], 0);
		expect(db.calls[0]).toMatchObject({
			fn: "save_aircraft_enrichment",
			p: { hex: "4d00f1", registration: "LX-LBR", icao_type: "B737", operator: "Luxair", photo_credit: "Tomas Scheffer", enrich_status: "ok" },
		});
		await e.step([live("4d00f1", "LGL32PR")], 1000);
		expect(db.calls[1]).toMatchObject({
			fn: "save_route",
			p: { callsign: "LGL32PR", airline_name: "Luxair", origin_icao: "LPPR", dest_icao: "ELLX", status: "ok" },
		});
		expect(e.routes.get("LGL32PR")?.status).toBe("ok");
	});

	it("uses the database cache instead of the external APIs", async () => {
		const seen = apis();
		const db = new FakeDb();
		db.aircraft = [{ hex: "4d00f1", registration: "LX-LBR", enrich_status: "ok", enriched_at: new Date(0).toISOString() }];
		db.routes = [{ callsign: "LGL32PR", status: "ok", fetched_at: new Date(0).toISOString() }];
		const e = enricher(db);
		await e.step([live("4d00f1", "LGL32PR")], 1000);
		expect(seen).toEqual([]);
		expect(db.calls).toEqual([]);
		expect(e.aircraft.get("4d00f1")?.registration).toBe("LX-LBR");
	});

	it("caches not found", async () => {
		apis();
		const db = new FakeDb();
		const e = enricher(db);
		await e.step([live("abcdef", "ZZZ999")], 0);
		await e.step([live("abcdef", "ZZZ999")], 1000);
		expect(db.calls.map((c) => [c.fn, c.p.enrich_status ?? c.p.status])).toEqual([
			["save_aircraft_enrichment", "not_found"],
			["save_route", "not_found"],
		]);
		await e.step([live("abcdef", "ZZZ999")], 2000);
		expect(db.calls).toHaveLength(2);
	});

	it("retries temporary failures and then caches an error for one hour", async () => {
		apis(503);
		const db = new FakeDb();
		const e = enricher(db);
		let t = 0;
		for (let i = 0; i < 10 && !db.calls.length; i++, t += 120_000) await e.step([live("4d00f1")], t);
		expect(db.calls).toHaveLength(1);
		expect(db.calls[0]!.p.enrich_status).toBe("error");

		const errorAt = Date.parse(db.calls[0]!.p.enriched_at);
		await e.step([live("4d00f1")], errorAt + 30 * 60_000);
		expect(db.calls).toHaveLength(1); // only retried after one hour
		t = errorAt + 61 * 60_000;
		for (let i = 0; i < 10 && db.calls.length < 2; i++, t += 120_000) await e.step([live("4d00f1")], t);
		expect(db.calls).toHaveLength(2); // tried again after the hour
	});

	it("still enriches from the external APIs when the database is unreachable", async () => {
		apis();
		const db = new FakeDb();
		db.select = async () => {
			throw new Error("HTTP 401");
		};
		db.rpc = async () => {
			throw new Error("HTTP 401");
		};
		const e = enricher(db);
		await e.step([live("4d00f1", "LGL32PR")], 0);
		expect(e.aircraft.get("4d00f1")).toMatchObject({ registration: "LX-LBR", photo_credit: "Tomas Scheffer", enrich_status: "ok" });
	});

	it("only enriches what it is given (the live aircraft)", async () => {
		const seen = apis();
		await enricher(new FakeDb()).step([], 0);
		expect(seen).toEqual([]);
	});
});
