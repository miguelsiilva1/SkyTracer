/**
 * Interface languages: English and Portuguese (Portugal). Any text missing from a language falls
 * back to English. Data from the receiver and the external sources (callsigns, airline and airport
 * names, aircraft types) is shown as received, in every language.
 */
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

const en = {
	"receiver": "Porto receiver",
	"theme.group": "Map theme",
	"theme.label": "Theme",
	"theme.light": "Light",
	"theme.dark": "Dark",
	"theme.standard": "Standard",
	"language.group": "Language",
	"status.connecting": "Connecting to the receiver",
	"status.reconnecting": "Connection lost. Reconnecting and showing the last known positions",
	"status.count": "{receiver} from the Porto receiver, {network} from adsb.fi",
	"status.countReceiver": "{receiver} aircraft from the Porto receiver",
	"status.updated": "{count}. Updated {time} UTC",
	"status.short": "{total} aircraft · {time} UTC",
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
	"search.placeholder": "Callsign, registration, airport…",
	"search.none": "No aircraft match",
	"search.more": "and {count} more on the map",
	"search.hidden": "Received now, but hidden by the filters",
	"search.lastSeen": "{name} is not being received. Last seen {time} UTC",
	"search.notNow": "{name} is not being received",
	"section.filters": "Filters",
	"section.legend": "Legend",
	"filters.open": "Filters",
	"filters.close": "Close filters",
	"filter.source": "Source",
	"filter.only": "Only",
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
	"replay.tag": "Replay",
	"replay.open": "Replay a past moment",
	"replay.status": "Replay · {time} UTC",
	"replay.live": "Back to live",
	"replay.play": "Play",
	"replay.pause": "Pause",
	"replay.speed": "Replay speed",
	"replay.jump": "Go to date and time (UTC)",
	"replay.loading": "Loading the history…",
	"replay.error": "Could not load the history. Retrying when the time changes.",
	"replay.empty": "No aircraft stored at this moment",
	"section.alerts": "Alerts",
	"alert.setting.emergency": "Emergencies",
	"alert.setting.military": "Military",
	"alert.setting.notify": "Browser notifications",
	"alert.watch.label": "Aircraft to watch",
	"alert.watch.placeholder": "ICAO, registration, type or callsign",
	"alert.watch.add": "Add",
	"alert.watch.remove": "Stop watching {id}",
	"alert.watch.hint": "Alerts fire once when a matching aircraft appears.",
	"alert.emergency": "Squawk {code}: {meaning}",
	"alert.military": "Military aircraft",
	"alert.watch": "On your watch list",
	"alert.dismiss": "Dismiss alert",
	"native.mapComing": "The map is available on the web for now. The Android and iOS map arrives in Sprint 3.",
} as const;

export type MessageKey = keyof typeof en;
export type Language = "en" | "pt";

/** Portuguese (Portugal). Aviation terms commonly used in English (callsign, squawk, Mach) are kept. */
const pt: Record<MessageKey, string> = {
	"receiver": "Recetor do Porto",
	"theme.group": "Tema do mapa",
	"theme.label": "Tema",
	"theme.light": "Claro",
	"theme.dark": "Escuro",
	"theme.standard": "Padrão",
	"language.group": "Idioma",
	"status.connecting": "A ligar ao recetor",
	"status.reconnecting": "Ligação perdida. A restabelecer e a mostrar as últimas posições conhecidas",
	"status.count": "{receiver} do recetor do Porto, {network} do adsb.fi",
	"status.countReceiver": "{receiver} aeronaves do recetor do Porto",
	"status.updated": "{count}. Atualizado às {time} UTC",
	"status.short": "{total} aeronaves · {time} UTC",
	"sources.group": "Aeronaves mostradas",
	"sources.all": "Todas as fontes",
	"sources.receiver": "Só o recetor do Porto",
	"legend.receiver": "Recebido no Porto",
	"legend.network": "Rede adsb.fi",
	"scale.caption": "Altitude, milhares de pés",
	"panel.close": "Fechar detalhes da aeronave",
	"panel.notIdentified": "Ainda não identificada",
	"panel.routeUnknown": "Rota desconhecida para este callsign",
	"panel.routeTo": "para",
	"panel.altitude": "Altitude",
	"panel.onGround": "No solo",
	"panel.groundSpeed": "Velocidade no solo",
	"panel.track": "Rumo",
	"panel.verticalRate": "Razão vertical",
	"panel.climbing": "A subir",
	"panel.descending": "A descer",
	"panel.squawk": "Squawk",
	"panel.icao": "Endereço ICAO",
	"panel.signal": "Sinal",
	"panel.positionFrom": "Posição por",
	"panel.photoBy": "Foto de {name}, planespotters.net",
	"source.receiver": "Recebida pelo recetor STAER no Porto",
	"source.network": "Não recebida no Porto. Posição e dados da rede {network}, mostrados em direto e não guardados",
	"source.noTrack": "Sem rasto: as posições do adsb.fi não são guardadas",
	"extra.title": "Da rede {network}",
	"extra.altGeom": "Altitude GPS",
	"extra.tas": "Velocidade verdadeira (TAS)",
	"extra.ias": "Velocidade indicada (IAS)",
	"extra.mach": "Mach",
	"extra.wind": "Vento",
	"extra.oat": "Temperatura exterior",
	"panel.photoOf": "Fotografia de {aircraft}",
	"emergency.banner": "Squawk {code}: {meaning}",
	"emergency.7500": "interferência ilícita",
	"emergency.7600": "falha de rádio",
	"emergency.7700": "emergência geral",
	"search.label": "Pesquisar aeronaves",
	"search.placeholder": "Callsign, matrícula, aeroporto…",
	"search.none": "Nenhuma aeronave corresponde",
	"search.more": "e mais {count} no mapa",
	"search.hidden": "Recebida agora, mas escondida pelos filtros",
	"search.lastSeen": "{name} não está a ser recebida. Vista pela última vez em {time} UTC",
	"search.notNow": "{name} não está a ser recebida",
	"section.filters": "Filtros",
	"section.legend": "Legenda",
	"filters.open": "Filtros",
	"filters.close": "Fechar filtros",
	"filter.source": "Fonte",
	"filter.only": "Só",
	"filter.altitude": "Altitude",
	"filter.altitude.all": "Todas",
	"filter.altitude.ground": "Solo",
	"filter.altitude.low": "<10k",
	"filter.altitude.mid": "10–30k",
	"filter.altitude.high": ">30k",
	"filter.emergency": "Emergências",
	"filter.withRoute": "Com rota",
	"filter.clear": "Limpar",
	"filter.showing": "A mostrar {shown} de {total} aeronaves",
	"replay.tag": "Replay",
	"replay.open": "Rever um momento passado",
	"replay.status": "Replay · {time} UTC",
	"replay.live": "Voltar ao direto",
	"replay.play": "Reproduzir",
	"replay.pause": "Pausa",
	"replay.speed": "Velocidade do replay",
	"replay.jump": "Ir para data e hora (UTC)",
	"replay.loading": "A carregar o histórico…",
	"replay.error": "Não foi possível carregar o histórico. Tenta de novo ao mudar a hora.",
	"replay.empty": "Sem aeronaves guardadas neste momento",
	"section.alerts": "Alertas",
	"alert.setting.emergency": "Emergências",
	"alert.setting.military": "Militares",
	"alert.setting.notify": "Notificações do browser",
	"alert.watch.label": "Aeronaves a seguir",
	"alert.watch.placeholder": "ICAO, matrícula, tipo ou callsign",
	"alert.watch.add": "Adicionar",
	"alert.watch.remove": "Deixar de seguir {id}",
	"alert.watch.hint": "Cada alerta dispara uma vez quando uma aeronave correspondente aparece.",
	"alert.emergency": "Squawk {code}: {meaning}",
	"alert.military": "Aeronave militar",
	"alert.watch": "Na tua lista",
	"alert.dismiss": "Fechar alerta",
	"native.mapComing": "Por agora, o mapa só está disponível na web. O mapa para Android e iOS chega no Sprint 3.",
};

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
