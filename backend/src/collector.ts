/**
 * Collector state, kept in the tracker's memory.
 *
 * Every read of aircraft.json updates the live state of each aircraft (the basis of the
 * real-time API). What goes to the database is buffered and written in batches:
 *   - each aircraft seen (first/last seen, category)
 *   - at most one position per aircraft every POSITION_MIN_INTERVAL, only if it is recent
 *     and newer than the last stored one
 *   - a receiver summary every SNAPSHOT_INTERVAL
 */
import { type AircraftState, type Snapshot, hasFreshPosition } from "./dump1090";

export interface LiveAircraft {
	hex: string;
	seenAt: number;
	posAt: number | null;
	callsign: string | null;
	lat: number | null;
	lon: number | null;
	altitudeFt: number | null;
	onGround: boolean;
	speedKt: number | null;
	trackDeg: number | null;
	vertRateFpm: number | null;
	squawk: string | null;
	category: string | null;
	rssiDbfs: number | null;
	mlat: boolean;
}

export interface AircraftRow {
	hex: string;
	seen_at: string;
	category: string | null;
}

export interface PositionRow {
	hex: string;
	ts: string;
	callsign: string | null;
	lat: number;
	lon: number;
	altitude_ft: number | null;
	on_ground: boolean;
	speed_kt: number | null;
	track_deg: number | null;
	vert_rate_fpm: number | null;
	squawk: string | null;
	rssi_dbfs: number | null;
	mlat: boolean;
}

export interface SnapshotRow {
	ts: string;
	messages_total: number | null;
	aircraft_total: number;
	aircraft_with_pos: number;
}

export interface Batch {
	aircraft: AircraftRow[];
	positions: PositionRow[];
	snapshots: SnapshotRow[];
}

export interface CollectorOptions {
	positionMinIntervalMs: number;
	snapshotIntervalMs: number;
	liveExpiryMs: number;
}

/** Upper bound of buffered positions while the database is unreachable. */
const MAX_PENDING_POSITIONS = 20_000;

const iso = (ms: number) => new Date(ms).toISOString();

function positionRow(a: AircraftState): PositionRow {
	return {
		hex: a.hex,
		ts: iso(a.posTs as number),
		callsign: a.callsign,
		lat: a.lat as number,
		lon: a.lon as number,
		altitude_ft: a.altitudeFt,
		on_ground: a.onGround,
		speed_kt: a.speedKt,
		track_deg: a.trackDeg,
		vert_rate_fpm: a.vertRateFpm,
		squawk: a.squawk,
		rssi_dbfs: a.rssiDbfs,
		mlat: a.mlat,
	};
}

export class Collector {
	readonly live = new Map<string, LiveAircraft>();
	private readonly lastPosition = new Map<string, number>();
	private lastSnapshot: number | null = null;
	private aircraft = new Map<string, AircraftRow>();
	private positions: PositionRow[] = [];
	private snapshots: SnapshotRow[] = [];

	constructor(private readonly opts: CollectorOptions) {}

	/** Applies one read. Returns the number of positions queued for storage. */
	ingest(snap: Snapshot): number {
		let queued = 0;
		for (const a of snap.aircraft) {
			const prev = this.live.get(a.hex);
			this.live.set(a.hex, {
				hex: a.hex,
				seenAt: a.ts,
				posAt: a.posTs,
				callsign: a.callsign ?? prev?.callsign ?? null,
				lat: a.lat,
				lon: a.lon,
				altitudeFt: a.altitudeFt,
				onGround: a.onGround,
				speedKt: a.speedKt,
				trackDeg: a.trackDeg,
				vertRateFpm: a.vertRateFpm,
				squawk: a.squawk,
				category: a.category ?? prev?.category ?? null,
				rssiDbfs: a.rssiDbfs,
				mlat: a.mlat,
			});
			const seen = this.aircraft.get(a.hex);
			if (!seen || seen.seen_at < iso(a.ts)) {
				this.aircraft.set(a.hex, { hex: a.hex, seen_at: iso(a.ts), category: a.category ?? seen?.category ?? null });
			}

			const last = this.lastPosition.get(a.hex);
			if (hasFreshPosition(a) && (last === undefined || (a.posTs as number) - last >= this.opts.positionMinIntervalMs)) {
				this.positions.push(positionRow(a));
				this.lastPosition.set(a.hex, a.posTs as number);
				queued++;
			}
		}

		for (const [hex, a] of this.live) {
			if (a.seenAt < snap.now - this.opts.liveExpiryMs) {
				this.live.delete(hex);
				this.lastPosition.delete(hex);
			}
		}

		if (this.lastSnapshot === null || snap.now - this.lastSnapshot >= this.opts.snapshotIntervalMs) {
			this.snapshots.push({
				ts: iso(snap.now),
				messages_total: snap.messagesTotal,
				aircraft_total: snap.aircraft.length,
				aircraft_with_pos: snap.aircraft.filter(hasFreshPosition).length,
			});
			this.lastSnapshot = snap.now;
		}
		return queued;
	}

	/** Removes and returns everything buffered for the database, or null if empty. */
	takeBatch(): Batch | null {
		if (!this.aircraft.size && !this.positions.length && !this.snapshots.length) return null;
		const batch = { aircraft: [...this.aircraft.values()], positions: this.positions, snapshots: this.snapshots };
		this.aircraft = new Map();
		this.positions = [];
		this.snapshots = [];
		return batch;
	}

	/** Puts back a batch that could not be written, so it is retried with the next one. */
	restore(batch: Batch): void {
		for (const a of batch.aircraft) if (!this.aircraft.has(a.hex)) this.aircraft.set(a.hex, a);
		this.positions = [...batch.positions, ...this.positions].slice(-MAX_PENDING_POSITIONS);
		this.snapshots = [...batch.snapshots, ...this.snapshots].slice(-1000);
	}
}
