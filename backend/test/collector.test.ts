import { describe, expect, it } from "vitest";
import { Collector } from "../src/collector";
import { parseSnapshot } from "../src/dump1090";

const OPTS = { positionMinIntervalMs: 15_000, snapshotIntervalMs: 15_000, liveExpiryMs: 300_000 };

const snapshot = (now: number, ...aircraft: object[]) => parseSnapshot({ now, messages: 100, aircraft });

const plane = (seenPos = 0, extra: object = {}) => ({
	hex: "4d00f1", flight: "LGL32PR ", lat: 41.37, lon: -8.55, altitude: 13425, speed: 373, track: 0,
	category: "A3", seen: 0, seen_pos: seenPos, rssi: -17.2, mlat: [], ...extra,
});

describe("Collector", () => {
	it("updates the live state and buffers aircraft, positions and a snapshot", () => {
		const c = new Collector(OPTS);
		const ground = { hex: "49004b", altitude: "ground", seen: 23.6 };
		expect(c.ingest(snapshot(1000, plane(), ground))).toBe(1);

		expect([...c.live.keys()].sort()).toEqual(["49004b", "4d00f1"]);
		expect(c.live.get("49004b")).toMatchObject({ callsign: null, onGround: true });

		const batch = c.takeBatch()!;
		expect(batch.aircraft.map((a) => a.hex).sort()).toEqual(["49004b", "4d00f1"]);
		expect(batch.aircraft.find((a) => a.hex === "4d00f1")?.category).toBe("A3");
		expect(batch.positions).toHaveLength(1);
		expect(batch.positions[0]).toMatchObject({ hex: "4d00f1", callsign: "LGL32PR", altitude_ft: 13425 });
		expect(batch.snapshots).toEqual([
			{ ts: new Date(1_000_000).toISOString(), messages_total: 100, aircraft_total: 2, aircraft_with_pos: 1 },
		]);
		expect(c.takeBatch()).toBeNull();
	});

	it("stores at most one position per interval and skips repeated positions", () => {
		const c = new Collector(OPTS);
		c.ingest(snapshot(1000, plane()));
		c.ingest(snapshot(1005, plane())); // 5 s later: skipped
		c.ingest(snapshot(1016, plane(16))); // same old position: skipped
		c.ingest(snapshot(1016, plane())); // 16 s later: stored
		expect(c.takeBatch()!.positions).toHaveLength(2);
		// the live state is always updated
		expect(c.live.get("4d00f1")!.seenAt).toBe(1_016_000);
	});

	it("does not store stale positions", () => {
		const c = new Collector(OPTS);
		c.ingest(snapshot(1000, plane(63.1)));
		expect(c.takeBatch()!.positions).toHaveLength(0);
		expect(c.live.size).toBe(1);
	});

	it("keeps the last callsign when a read has none", () => {
		const c = new Collector(OPTS);
		c.ingest(snapshot(1000, plane()));
		c.ingest(snapshot(1001, plane(0, { flight: undefined })));
		expect(c.live.get("4d00f1")!.callsign).toBe("LGL32PR");
	});

	it("writes a snapshot per interval and expires aircraft not seen for a while", () => {
		const c = new Collector(OPTS);
		for (let t = 1000; t < 1031; t += 3) c.ingest(snapshot(t, plane()));
		expect(c.takeBatch()!.snapshots).toHaveLength(3); // t = 1000, 1015, 1030

		c.ingest(snapshot(1400, { hex: "3949ea", seen: 0 })); // 4d00f1 seen more than 300 s ago
		expect([...c.live.keys()]).toEqual(["3949ea"]);
	});

	it("restores a batch that could not be written", () => {
		const c = new Collector(OPTS);
		c.ingest(snapshot(1000, plane()));
		const failed = c.takeBatch()!;
		c.ingest(snapshot(1020, plane()));
		c.restore(failed);
		const batch = c.takeBatch()!;
		expect(batch.positions.map((p) => p.ts)).toEqual([new Date(1_000_000).toISOString(), new Date(1_020_000).toISOString()]);
		expect(batch.aircraft).toHaveLength(1);
	});
});
