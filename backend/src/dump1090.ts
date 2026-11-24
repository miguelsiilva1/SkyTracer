/**
 * Reads and normalises the dump1090 aircraft.json.
 *
 * The course receiver runs dump1090-mutability, which uses old field names (`altitude`,
 * `speed`, `vert_rate`); newer versions (dump1090-fa / readsb) use `alt_baro`, `gs`,
 * `baro_rate`. Both are accepted and always returned in the same shape.
 *
 * Timestamps: `seen` is the age of the last message and `seen_pos` the age of the last
 * position. dump1090 keeps aircraft for ~300 s without messages, so the position time must
 * come from `seen_pos`, otherwise the same old position would be stored several times.
 * All times are milliseconds since the epoch.
 */

/** Positions older than this are not considered current. */
export const MAX_POSITION_AGE_S = 60;

export interface AircraftState {
	hex: string;
	ts: number; // last message (now - seen)
	posTs: number | null; // last position (now - seen_pos)
	callsign: string | null;
	lat: number | null;
	lon: number | null;
	altitudeFt: number | null;
	onGround: boolean;
	speedKt: number | null;
	trackDeg: number | null;
	vertRateFpm: number | null;
	squawk: string | null;
	rssiDbfs: number | null;
	mlat: boolean;
	seenS: number | null;
	seenPosS: number | null;
	category: string | null;
	nucp: number | null;
}

export interface Snapshot {
	now: number;
	messagesTotal: number | null;
	aircraft: AircraftState[];
}

type Raw = Record<string, unknown>;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown): number | null => (isNum(v) ? v : null);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

function first(d: Raw, ...keys: string[]): unknown {
	for (const k of keys) if (d[k] !== undefined && d[k] !== null) return d[k];
	return null;
}

const ago = (now: number, seconds: number) => Math.round(now - seconds * 1000);

export function hasPosition(a: AircraftState): boolean {
	return a.lat !== null && a.lon !== null;
}

export function hasFreshPosition(a: AircraftState): boolean {
	return hasPosition(a) && a.seenPosS !== null && a.seenPosS <= MAX_POSITION_AGE_S;
}

export function parseAircraft(raw: Raw, now: number): AircraftState | null {
	const hex = (typeof raw.hex === "string" ? raw.hex : "").trim().toLowerCase();
	// '~' marks a non-ICAO address (TIS-B); ignored for now
	if (hex.length !== 6 || hex.startsWith("~")) return null;

	const alt = first(raw, "alt_baro", "altitude");
	const lat = numOrNull(raw.lat);
	const lon = numOrNull(raw.lon);
	const located = lat !== null && lon !== null;
	const seen = numOrNull(raw.seen);
	// without seen_pos the position is assumed to be as recent as the last message
	const seenPos = numOrNull(raw.seen_pos) ?? (located ? seen : null);
	const vr = first(raw, "baro_rate", "vert_rate", "geom_rate");
	const mlat = Array.isArray(raw.mlat) ? raw.mlat : [];

	return {
		hex,
		ts: seen !== null ? ago(now, seen) : now,
		posTs: located && seenPos !== null ? ago(now, seenPos) : null,
		callsign: (typeof raw.flight === "string" ? raw.flight.trim() : "") || null,
		lat,
		lon,
		altitudeFt: isNum(alt) ? Math.trunc(alt) : null,
		onGround: alt === "ground",
		speedKt: numOrNull(first(raw, "gs", "speed")),
		trackDeg: numOrNull(raw.track),
		vertRateFpm: isNum(vr) ? Math.trunc(vr) : null,
		squawk: strOrNull(raw.squawk),
		rssiDbfs: numOrNull(raw.rssi),
		mlat: mlat.includes("lat"),
		seenS: seen,
		seenPosS: seenPos,
		category: strOrNull(raw.category),
		nucp: Number.isInteger(raw.nucp) ? (raw.nucp as number) : null,
	};
}

export function parseSnapshot(payload: unknown): Snapshot {
	const p = (payload && typeof payload === "object" ? payload : {}) as Raw;
	const now = isNum(p.now) ? Math.round(p.now * 1000) : Date.now();
	const list = Array.isArray(p.aircraft) ? (p.aircraft as Raw[]) : [];
	const aircraft = list.map((raw) => parseAircraft(raw, now)).filter((a): a is AircraftState => a !== null);
	return { now, messagesTotal: numOrNull(p.messages), aircraft };
}
