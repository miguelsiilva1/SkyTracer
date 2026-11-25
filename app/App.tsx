import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import { fetchTrack } from "./src/api";
import { applyFilters, type Filters, NO_FILTERS } from "./src/filters";
import AircraftPanel from "./src/components/AircraftPanel";
import LiveMap, { type MapFocus } from "./src/components/LiveMap";
import SearchFilters from "./src/components/SearchFilters";
import TopBar, { type SourceFilter } from "./src/components/TopBar";
import { TRACK_MINUTES, TRACK_REFRESH_MS } from "./src/config";
import { LanguageProvider } from "./src/i18n";
import { ThemeProvider, useTheme } from "./src/ThemeContext";
import type { LiveAircraft, TrackPoint } from "./src/types";
import { useLiveAircraft } from "./src/useLiveAircraft";

const FONTS = "https://fonts.googleapis.com/css2?family=B612:wght@400;700&family=B612+Mono:wght@400;700&display=swap";
const WIDE = 768;

function Screen() {
	const { name, c } = useTheme();
	const { aircraft, updatedAt, status } = useLiveAircraft();
	const [selected, setSelected] = useState<string | null>(null);
	const [track, setTrack] = useState<TrackPoint[]>([]);
	const [sources, setSources] = useState<SourceFilter>("all");
	const [filters, setFilters] = useState<Filters>(NO_FILTERS);
	const [focus, setFocus] = useState<MapFocus | null>(null);
	const { width } = useWindowDimensions();
	const wide = width >= WIDE;

	const bySource = sources === "all" ? aircraft : aircraft.filter((a) => a.source === "receiver");
	const shown = applyFilters(bySource, filters);
	const current = shown.find((a) => a.hex === selected);
	const receiverCount = aircraft.filter((a) => a.source === "receiver").length;
	const stored = current?.source === "receiver";

	// track of the selected aircraft (US10), refreshed while it stays selected; only receiver
	// positions are stored, so network-only aircraft have no track
	useEffect(() => {
		setTrack([]);
		if (!selected || !stored) return;
		const ctrl = new AbortController();
		const load = () => fetchTrack(selected, TRACK_MINUTES, ctrl.signal).then(setTrack).catch(() => {});
		load();
		const timer = setInterval(load, TRACK_REFRESH_MS);
		return () => {
			ctrl.abort();
			clearInterval(timer);
		};
	}, [selected, stored]);

	// a search result: centre the map on it and open its panel (US09)
	const pick = (a: LiveAircraft) => {
		setSelected(a.hex);
		setFocus({ lon: a.lon, lat: a.lat, key: Date.now() });
	};

	return (
		<View style={[styles.root, { backgroundColor: c.bg }]}>
			<StatusBar style={name === "dark" ? "light" : "dark"} />
			<View style={styles.map}>
				<LiveMap aircraft={shown} selectedHex={selected} track={track} focus={focus} onSelect={setSelected} />
				<TopBar
					receiverCount={receiverCount}
					networkCount={aircraft.length - receiverCount}
					updatedAt={updatedAt}
					status={status}
					sources={sources}
					onSources={setSources}
				>
					<SearchFilters filters={filters} onChange={setFilters} matches={shown} total={bySource.length} onPick={pick} />
				</TopBar>
			</View>
			{current ? (
				<View style={wide ? styles.side : styles.sheet}>
					<AircraftPanel aircraft={current} onClose={() => setSelected(null)} />
				</View>
			) : null}
		</View>
	);
}

export default function App() {
	useEffect(() => {
		if (Platform.OS !== "web" || document.getElementById("skytracer-fonts")) return;
		const link = Object.assign(document.createElement("link"), { id: "skytracer-fonts", rel: "stylesheet", href: FONTS });
		document.head.appendChild(link);
	}, []);

	return (
		<LanguageProvider>
			<ThemeProvider>
				<Screen />
			</ThemeProvider>
		</LanguageProvider>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1, flexDirection: "row" },
	map: { flex: 1 },
	side: { width: 380 },
	sheet: { position: "absolute", left: 0, right: 0, bottom: 0, height: "60%" },
});
