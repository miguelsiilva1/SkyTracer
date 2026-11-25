import { useCallback, useEffect, useRef, useState } from "react";
import { WS_URL } from "./config";
import type { ConnectionStatus, LiveAircraft, LiveMessage } from "./types";

const MAX_BACKOFF_MS = 30_000;

/** Map area shown ([west, south, east, north]) and aircraft always wanted (the selected one). */
export interface LiveView {
	bbox: [number, number, number, number];
	keep: string[];
}

/**
 * Live state from `WS /ws/live` (US06). Reconnects automatically with exponential backoff,
 * keeping the last known aircraft on screen meanwhile. `setView` tells the server which part of
 * the map is shown, so it only sends the adsb.fi aircraft there (the receiver's are always sent).
 */
export function useLiveAircraft() {
	const [aircraft, setAircraft] = useState<LiveAircraft[]>([]);
	const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
	const [status, setStatus] = useState<ConnectionStatus>("connecting");
	const socket = useRef<WebSocket | null>(null);
	const view = useRef<string | null>(null);

	const setView = useCallback((v: LiveView) => {
		view.current = JSON.stringify(v);
		if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(view.current);
	}, []);

	useEffect(() => {
		let ws: WebSocket | null = null;
		let retry: ReturnType<typeof setTimeout> | undefined;
		let attempt = 0;
		let closed = false;

		const connect = () => {
			ws = new WebSocket(WS_URL);
			socket.current = ws;
			ws.onopen = () => {
				attempt = 0;
				setStatus("live");
				if (view.current) ws?.send(view.current);
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

	return { aircraft, updatedAt, status, setView };
}
