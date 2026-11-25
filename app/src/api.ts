import { API_URL } from "./config";
import type { KnownAircraft, TrackPoint } from "./types";

export async function fetchTrack(hex: string, minutes: number, signal?: AbortSignal): Promise<TrackPoint[]> {
	const resp = await fetch(`${API_URL}/aircraft/${hex}/track?minutes=${minutes}`, { signal });
	if (!resp.ok) throw new Error(`track: HTTP ${resp.status}`);
	return resp.json();
}

/** Stored data of an aircraft the receiver has seen (US09); null when it is unknown. */
export async function fetchAircraft(hex: string, signal?: AbortSignal): Promise<KnownAircraft | null> {
	const resp = await fetch(`${API_URL}/aircraft/${hex}`, { signal });
	if (resp.status === 404) return null;
	if (!resp.ok) throw new Error(`aircraft: HTTP ${resp.status}`);
	return resp.json();
}
