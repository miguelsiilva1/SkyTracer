import { API_URL } from "./config";
import type { TrackPoint } from "./types";

export async function fetchTrack(hex: string, minutes: number, signal?: AbortSignal): Promise<TrackPoint[]> {
	const resp = await fetch(`${API_URL}/aircraft/${hex}/track?minutes=${minutes}`, { signal });
	if (!resp.ok) throw new Error(`track: HTTP ${resp.status}`);
	return resp.json();
}
