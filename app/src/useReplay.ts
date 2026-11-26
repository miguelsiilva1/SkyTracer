/**
 * Airspace replay (US12). The stored history is loaded in 10-minute windows around the replay
 * time; the airspace at an instant is the last position of each aircraft in the 60 s before it,
 * as on the live map. Playing advances the time at 1×, 10× or 60×; the next window is loaded in
 * advance so playback does not stop at the boundaries.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchReplay } from "./api";
import type { LiveAircraft, ReplayIdentity, ReplayPosition, ReplayRoute, ReplayWindow, TrackPoint } from "./types";

const WINDOW_MS = 10 * 60_000;
const MAX_AGE_MS = 60_000; // same as the live map
const TICK_MS = 250;
export const RETENTION_MS = 7 * 86_400_000;
export const SPEEDS = [1, 10, 60] as const;
export type Speed = (typeof SPEEDS)[number];

interface Loaded {
	positions: Map<string, ReplayPosition[]>; // per aircraft, ordered by time
	aircraft: Map<string, ReplayIdentity>;
	routes: Map<string, ReplayRoute>;
}

const windowStart = (t: number) => Math.floor(t / WINDOW_MS) * WINDOW_MS;

function index(w: ReplayWindow): Loaded {
	const positions = new Map<string, ReplayPosition[]>();
	for (const p of w.positions) {
		const list = positions.get(p.hex) ?? [];
		list.push(p);
		positions.set(p.hex, list);
	}
	return {
		positions,
		aircraft: new Map(w.aircraft.map((a) => [a.hex, a])),
		routes: new Map(w.routes.map((r) => [r.callsign, r])),
	};
}

/** Last position at or before `t` (the list is ordered by time). */
function lastAt(list: ReplayPosition[], t: number): ReplayPosition | undefined {
	let lo = 0;
	let hi = list.length - 1;
	let found: ReplayPosition | undefined;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (Date.parse(list[mid]!.ts) <= t) {
			found = list[mid];
			lo = mid + 1;
		} else hi = mid - 1;
	}
	return found;
}

function toLive(p: ReplayPosition, id: ReplayIdentity | undefined, r: ReplayRoute | undefined): LiveAircraft {
	return {
		hex: p.hex,
		source: "receiver",
		callsign: p.callsign,
		lat: p.lat,
		lon: p.lon,
		altitude_ft: p.altitude_ft,
		on_ground: p.on_ground,
		speed_kt: p.speed_kt,
		track_deg: p.track_deg,
		vert_rate_fpm: p.vert_rate_fpm,
		squawk: p.squawk,
		category: null,
		rssi_dbfs: null,
		mlat: p.mlat,
		seen_at: p.ts,
		pos_at: p.ts,
		registration: id?.registration ?? null,
		icao_type: id?.icao_type ?? null,
		type_name: id?.type_name ?? null,
		manufacturer: id?.manufacturer ?? null,
		operator: id?.operator ?? null,
		country: id?.country ?? null,
		photo_url: id?.photo_url ?? null,
		photo_credit: id?.photo_credit ?? null,
		photo_link: id?.photo_link ?? null,
		airline_name: r?.airline_name ?? null,
		airline_icao: r?.airline_icao ?? null,
		airline_iata: r?.airline_iata ?? null,
		origin_icao: r?.origin_icao ?? null,
		origin_iata: r?.origin_iata ?? null,
		origin_name: r?.origin_name ?? null,
		dest_icao: r?.dest_icao ?? null,
		dest_iata: r?.dest_iata ?? null,
		dest_name: r?.dest_name ?? null,
		extra: null,
		extra_source: null,
	};
}

export function useReplay() {
	const [at, setAt] = useState<number | null>(null); // null: live
	const [playing, setPlaying] = useState(false);
	const [speed, setSpeed] = useState<Speed>(1);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(false);
	const windows = useRef(new Map<number, Loaded | "loading">());
	const [loadedCount, setLoadedCount] = useState(0); // re-renders when a window arrives

	const load = useCallback((start: number) => {
		if (windows.current.has(start) || start > Date.now()) return;
		windows.current.set(start, "loading");
		setLoading(true);
		fetchReplay(new Date(start), WINDOW_MS / 60_000)
			.then((w) => {
				windows.current.set(start, index(w));
				setError(false);
			})
			.catch(() => {
				windows.current.delete(start);
				setError(true);
			})
			.finally(() => {
				setLoading([...windows.current.values()].includes("loading"));
				setLoadedCount((n) => n + 1);
			});
	}, []);

	// the window of the replay time and the next one
	useEffect(() => {
		if (at === null) return;
		const start = windowStart(at);
		load(start);
		load(start + WINDOW_MS);
	}, [at, load]);

	useEffect(() => {
		if (at === null || !playing) return;
		const timer = setInterval(() => {
			setAt((t) => {
				if (t === null) return t;
				const next = t + TICK_MS * speed;
				if (next >= Date.now()) {
					setPlaying(false);
					return Date.now();
				}
				return next;
			});
		}, TICK_MS);
		return () => clearInterval(timer);
	}, [at === null, playing, speed]);

	const current = at === null ? undefined : windows.current.get(windowStart(at));
	const ready = current !== undefined && current !== "loading";

	// a window starts 60 s before its start time, so it alone covers every instant inside it
	const aircraft = useMemo<LiveAircraft[]>(() => {
		if (at === null || !current || current === "loading") return [];
		const out: LiveAircraft[] = [];
		for (const [hex, list] of current.positions) {
			const p = lastAt(list, at);
			if (!p || at - Date.parse(p.ts) > MAX_AGE_MS) continue;
			out.push(toLive(p, current.aircraft.get(hex), p.callsign ? current.routes.get(p.callsign) : undefined));
		}
		return out;
	}, [at, current, loadedCount]);

	/** Track of one aircraft up to the replay time, from the loaded windows (at most the last hour). */
	const trackOf = useCallback(
		(hex: string): TrackPoint[] => {
			if (at === null) return [];
			const points: TrackPoint[] = [];
			for (let start = windowStart(at) - 5 * WINDOW_MS; start <= windowStart(at); start += WINDOW_MS) {
				const w = windows.current.get(start);
				if (!w || w === "loading") continue;
				for (const p of w.positions.get(hex) ?? []) {
					const t = Date.parse(p.ts);
					if (t <= at && t >= start && (!points.length || t > Date.parse(points[points.length - 1]!.ts))) points.push(p);
				}
			}
			return points;
		},
		[at, loadedCount],
	);

	/** Starts the replay at `t`, or moves an ongoing replay to `t`, within the retention period. */
	const start = useCallback((t: number) => {
		setAt(Math.max(Date.now() - RETENTION_MS, Math.min(t, Date.now())));
	}, []);
	const stop = useCallback(() => {
		setAt(null);
		setPlaying(false);
		windows.current.clear();
	}, []);

	return { at, active: at !== null, playing, setPlaying, speed, setSpeed, start, stop, aircraft, trackOf, loading: loading && !ready, error };
}
