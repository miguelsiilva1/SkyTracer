import { useEffect, useState } from "react";
import { WS_URL } from "./config";
import type { ConnectionStatus, LiveAircraft, LiveMessage } from "./types";

const MAX_BACKOFF_MS = 30_000;

/**
 * Live state from `WS /ws/live` (US06). Reconnects automatically with exponential backoff,
 * keeping the last known aircraft on screen meanwhile.
 */
export function useLiveAircraft() {
	const [aircraft, setAircraft] = useState<LiveAircraft[]>([]);
	const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
	const [status, setStatus] = useState<ConnectionStatus>("connecting");

	useEffect(() => {
		let ws: WebSocket | null = null;
		let retry: ReturnType<typeof setTimeout> | undefined;
		let attempt = 0;
		let closed = false;

		const connect = () => {
			ws = new WebSocket(WS_URL);
			ws.onopen = () => {
				attempt = 0;
				setStatus("live");
			};
			ws.onmessage = (event) => {
				const msg = JSON.parse(String(event.data)) as LiveMessage;
				// the course receiver has priority: its aircraft first; an aircraft without a source
				// comes from an API version that only knew the receiver
				const list = msg.aircraft.map((a) => ({ ...a, source: a.source ?? "receiver" }));
				setAircraft([...list.filter((a) => a.source === "receiver"), ...list.filter((a) => a.source !== "receiver")]);
				setUpdatedAt(new Date(msg.ts));
			};
			ws.onclose = () => {
				if (closed) return;
				setStatus("reconnecting");
				retry = setTimeout(connect, Math.min(1000 * 2 ** attempt++, MAX_BACKOFF_MS));
			};
		};
		connect();

		return () => {
			closed = true;
			clearTimeout(retry);
			ws?.close();
		};
	}, []);

	return { aircraft, updatedAt, status };
}
