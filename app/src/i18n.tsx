/**
 * Interface languages: English and Portuguese. Any text missing from a language falls back to
 * English. Data from the receiver and the external sources (callsigns, airline and airport
 * names, aircraft types) is shown as received, in every language.
 */
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

const en = {
	"receiver": "Porto receiver",
	"theme.group": "Map theme",
	"theme.light": "Light",
	"theme.dark": "Dark",
	"theme.standard": "Standard",
	"language.group": "Language",
	"status.connecting": "Connecting to the receiver",
	"status.reconnecting": "Connection lost. Reconnecting and showing the last known positions",
	"status.count": "{receiver} from the Porto receiver, {network} from adsb.fi",
	"status.countReceiver": "{receiver} aircraft from the Porto receiver",
	"status.updated": "{count}. Updated {time} UTC",
	"sources.group": "Aircraft shown",
	"sources.all": "All sources",
	"sources.receiver": "Porto receiver only",
	"legend.receiver": "Received in Porto",
	"legend.network": "adsb.fi network",
	"scale.caption": "Altitude, thousands of feet",
	"panel.close": "Close aircraft details",
	"panel.notIdentified": "Not yet identified",
	"panel.routeUnknown": "Route not known for this callsign",
	"panel.routeTo": "to",
	"panel.altitude": "Altitude",
	"panel.onGround": "On ground",
	"panel.groundSpeed": "Ground speed",
	"panel.track": "Track",
	"panel.verticalRate": "Vertical rate",
	"panel.climbing": "Climbing",
	"panel.descending": "Descending",
	"panel.squawk": "Squawk",
	"panel.icao": "ICAO address",
	"panel.signal": "Signal",
	"panel.positionFrom": "Position from",
	"panel.photoBy": "Photo by {name}, planespotters.net",
	"source.receiver": "Received by the STAER receiver in Porto",
	"source.network": "Not received in Porto. Position and data from the {network} network, shown live and not stored",
	"source.noTrack": "No track: positions from adsb.fi are not stored",
	"extra.title": "From the {network} network",
	"extra.altGeom": "GPS altitude",
	"extra.tas": "True airspeed",
	"extra.ias": "Indicated airspeed",
	"extra.mach": "Mach",
	"extra.wind": "Wind",
	"extra.oat": "Outside air temperature",
	"panel.photoOf": "Photograph of {aircraft}",
	"emergency.banner": "Squawk {code}: {meaning}",
	"emergency.7500": "unlawful interference",
	"emergency.7600": "radio failure",
	"emergency.7700": "general emergency",
	"search.label": "Search aircraft",
	"search.placeholder": "Callsign, registration, ICAO, airline, type, airport",
	"search.none": "No aircraft match",
	"search.more": "and {count} more on the map",
	"search.hidden": "Received now, but hidden by the filters",
	"search.lastSeen": "{name} is not being received. Last seen {time} UTC",
	"search.notNow": "{name} is not being received",
	"filter.altitude": "Altitude",
	"filter.altitude.all": "All",
	"filter.altitude.ground": "Ground",
	"filter.altitude.low": "<10k",
	"filter.altitude.mid": "10–30k",
	"filter.altitude.high": ">30k",
	"filter.emergency": "Emergencies",
	"filter.withRoute": "With route",
	"filter.clear": "Clear",
	"filter.showing": "Showing {shown} of {total} aircraft",
	"native.mapComing": "The map is available on the web for now. The Android and iOS map arrives in Sprint 3.",
} as const;

export type MessageKey = keyof typeof en;
export type Language = "en" | "pt";

/** Portuguese: filled in with the names chosen for the Portuguese version. */
const pt: Partial<Record<MessageKey, string>> = {};

const dictionaries: Record<Language, Partial<Record<MessageKey, string>>> = { en, pt };
const STORAGE_KEY = "skytracer.language";

function initialLanguage(): Language {
	if (Platform.OS !== "web") return "en";
	try {
		const saved = window.localStorage.getItem(STORAGE_KEY);
		if (saved === "en" || saved === "pt") return saved;
	} catch {
		// storage unavailable: use the browser language
	}
	return navigator.language?.toLowerCase().startsWith("pt") ? "pt" : "en";
}

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

interface LanguageValue {
	language: Language;
	setLanguage: (language: Language) => void;
	t: Translate;
}

const LanguageContext = createContext<LanguageValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
	const [language, setLanguage] = useState<Language>(initialLanguage);

	useEffect(() => {
		if (Platform.OS !== "web") return;
		try {
			window.localStorage.setItem(STORAGE_KEY, language);
		} catch {
			// not persisted; the choice still applies to this visit
		}
		document.documentElement.lang = language;
	}, [language]);

	const value = useMemo<LanguageValue>(() => {
		const dict = dictionaries[language];
		const t: Translate = (key, params) => {
			const text = dict[key] ?? en[key];
			return params ? text.replace(/\{(\w+)\}/g, (_, p: string) => String(params[p] ?? `{${p}}`)) : text;
		};
		return { language, setLanguage, t };
	}, [language]);

	return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useT(): LanguageValue {
	const value = useContext(LanguageContext);
	if (!value) throw new Error("useT outside LanguageProvider");
	return value;
}
