import { describe, expect, it } from "vitest";
import { hasFreshPosition, hasPosition, parseSnapshot } from "../src/dump1090";
import receiverSample from "./fixtures/aircraft_mutability.json";

const MUTABILITY_SAMPLE = {
	now: 1762766460.0,
	messages: 123456,
	aircraft: [
		{
			hex: "4951C6", squawk: "5312", flight: "TAP1942 ", lat: 41.32, lon: -8.51, altitude: 24000,
			vert_rate: -1200, track: 187, speed: 412, mlat: [], messages: 800, seen: 0.5, rssi: -18.2,
		},
		{ hex: "3c6589", altitude: "ground", seen: 3 }, // no position, on the ground
		{ hex: "~abc123", lat: 41.0, lon: -8.0 }, // TIS-B, ignored
	],
};

const FA_SAMPLE = {
	now: 1762766460.0,
	aircraft: [{ hex: "4ca7b1", flight: "RYR82KQ", lat: 41.1, lon: -8.6, alt_baro: 3500, gs: 180.4, baro_rate: 640, mlat: ["lat", "lon"] }],
};

describe("parseSnapshot", () => {
	it("normalises dump1090-mutability fields", () => {
		const snap = parseSnapshot(MUTABILITY_SAMPLE);
		expect(snap.messagesTotal).toBe(123456);
		expect(snap.aircraft).toHaveLength(2);

		const tap = snap.aircraft[0]!;
		expect(tap.hex).toBe("4951c6");
		expect(tap.callsign).toBe("TAP1942");
		expect([tap.altitudeFt, tap.speedKt, tap.vertRateFpm]).toEqual([24000, 412, -1200]);
		expect(hasPosition(tap) && !tap.mlat).toBe(true);
		expect(tap.ts).toBe(1762766459500);
		expect(tap.posTs).toBe(tap.ts); // without seen_pos it uses seen
		expect(hasFreshPosition(tap)).toBe(true);
	});

	it("handles aircraft on the ground without position", () => {
		const ground = parseSnapshot(MUTABILITY_SAMPLE).aircraft[1]!;
		expect(ground.onGround).toBe(true);
		expect(ground.altitudeFt).toBeNull();
		expect(hasPosition(ground)).toBe(false);
	});

	it("normalises dump1090-fa / readsb fields", () => {
		const a = parseSnapshot(FA_SAMPLE).aircraft[0]!;
		expect([a.altitudeFt, a.speedKt, a.vertRateFpm]).toEqual([3500, 180.4, 640]);
		expect(a.mlat).toBe(true);
	});

	it("takes the position time from seen_pos", () => {
		const a = parseSnapshot({
			now: 1000.0,
			aircraft: [{ hex: "4868e2", lat: 42.1, lon: -8.5, seen: 20.7, seen_pos: 54.8, category: "A3", nucp: 7 }],
		}).aircraft[0]!;
		expect(a.ts).toBe(1_000_000 - 20_700);
		expect(a.posTs).toBe(1_000_000 - 54_800);
		expect(hasFreshPosition(a)).toBe(true);
		expect([a.category, a.nucp]).toEqual(["A3", 7]);
	});

	it("does not treat a stale position as fresh", () => {
		const a = parseSnapshot({ now: 1000.0, aircraft: [{ hex: "3c7984", lat: 42.2, lon: -6.8, seen: 26, seen_pos: 63.1 }] }).aircraft[0]!;
		expect(hasPosition(a) && !hasFreshPosition(a)).toBe(true);
	});

	it("parses a real sample of the course receiver", () => {
		const snap = parseSnapshot(receiverSample);
		expect(snap.aircraft).toHaveLength(receiverSample.aircraft.length);
		const byHex = new Map(snap.aircraft.map((a) => [a.hex, a]));

		const ground = byHex.get("49004b")!;
		expect(ground.onGround && ground.altitudeFt === null && !hasPosition(ground)).toBe(true);

		const stale = byHex.get("3c7984")!;
		expect(hasPosition(stale) && !hasFreshPosition(stale)).toBe(true);

		const fresh = snap.aircraft.filter(hasFreshPosition);
		// receiver in Porto: everything it sees is in the north-west of the Iberian Peninsula
		expect(fresh.length).toBeGreaterThan(0);
		for (const a of fresh) {
			expect(a.lat!).toBeGreaterThan(36);
			expect(a.lat!).toBeLessThan(45);
			expect(a.lon!).toBeGreaterThan(-15);
			expect(a.lon!).toBeLessThan(-2);
		}
		for (const a of snap.aircraft) expect(a.callsign === null || a.callsign === a.callsign.trim()).toBe(true);
	});
});
