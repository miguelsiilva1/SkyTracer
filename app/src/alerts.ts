/**
 * Alerts (US13): emergency squawks, military aircraft and a watch list of ICAO addresses,
 * registrations, aircraft types or callsigns. An alert fires once when a matching aircraft
 * appears and fires again only after it has disappeared. Settings are kept on the device.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import type { LiveAircraft } from "./types";

export interface AlertSettings {
	emergency: boolean;
	military: boolean;
	watch: string[]; // upper case
	notify: boolean; // also as browser notifications
}

export type AlertReason = "emergency" | "military" | "watch";

export interface Alert {
	id: number;
	hex: string;
	label: string;
	reasons: AlertReason[];
	squawk: string | null;
	at: Date;
}

const DEFAULTS: AlertSettings = { emergency: true, military: false, watch: [], notify: false };
const STORAGE_KEY = "skytracer.alerts";
const EMERGENCY = new Set(["7500", "7600", "7700"]);
const MAX_SHOWN = 4;

function loadSettings(): AlertSettings {
	if (Platform.OS !== "web") return DEFAULTS;
	try {
		const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<AlertSettings> | null;
		return saved ? { ...DEFAULTS, ...saved, watch: Array.isArray(saved.watch) ? saved.watch.map(String) : [] } : DEFAULTS;
	} catch {
		return DEFAULTS;
	}
}

/** Why an aircraft matches the alert settings (empty when it does not). */
export function alertReasons(a: LiveAircraft, s: AlertSettings): AlertReason[] {
	const reasons: AlertReason[] = [];
	if (s.emergency && a.squawk && EMERGENCY.has(a.squawk)) reasons.push("emergency");
	if (s.military && a.military) reasons.push("military");
	const ids = [a.hex, a.registration, a.icao_type, a.callsign].filter((v): v is string => Boolean(v)).map((v) => v.toUpperCase());
	if (s.watch.some((w) => ids.includes(w))) reasons.push("watch");
	return reasons;
}

/** `describe` gives the text of a browser notification, in the interface language. */
export function useAlerts(aircraft: LiveAircraft[], enabled: boolean, describe: (alert: Alert) => string) {
	const [settings, setSettingsState] = useState<AlertSettings>(loadSettings);
	const [alerts, setAlerts] = useState<Alert[]>([]);
	const active = useRef(new Set<string>()); // aircraft that already fired and are still matching
	const nextId = useRef(1);

	const setSettings = useCallback((next: AlertSettings) => {
		setSettingsState(next);
		if (Platform.OS !== "web") return;
		try {
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
		} catch {
			// not persisted; the settings still apply to this visit
		}
	}, []);

	useEffect(() => {
		if (!enabled) return;
		const matching = new Set<string>();
		const fired: Alert[] = [];
		for (const a of aircraft) {
			const reasons = alertReasons(a, settings);
			if (!reasons.length) continue;
			matching.add(a.hex);
			if (active.current.has(a.hex)) continue;
			fired.push({
				id: nextId.current++,
				hex: a.hex,
				label: a.callsign ?? a.registration ?? a.hex.toUpperCase(),
				reasons,
				squawk: a.squawk,
				at: new Date(),
			});
		}
		active.current = matching; // an aircraft that disappears can fire again when it comes back
		if (!fired.length) return;
		setAlerts((list) => [...fired, ...list].slice(0, MAX_SHOWN));
		if (settings.notify && Platform.OS === "web" && "Notification" in window && Notification.permission === "granted") {
			for (const f of fired) new Notification(`SkyTracer: ${f.label}`, { body: describe(f), tag: f.hex });
		}
	}, [aircraft, settings, enabled, describe]);

	const dismiss = useCallback((id: number) => setAlerts((list) => list.filter((a) => a.id !== id)), []);

	return { settings, setSettings, alerts, dismiss };
}
