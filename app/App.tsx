import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import { fetchTrack } from "./src/api";
import { applyFilters, type Filters, NO_FILTERS } from "./src/filters";
import AircraftPanel from "./src/components/AircraftPanel";
import LiveMap, { type MapFocus } from "./src/components/LiveMap";
import ReplayBar from "./src/components/ReplayBar";
import TopBar, { type SourceFilter } from "./src/components/TopBar";
import { TRACK_MINUTES, TRACK_REFRESH_MS } from "./src/config";
import { LanguageProvider } from "./src/i18n";
import { ThemeProvider, useTheme } from "./src/ThemeContext";
import type { LiveAircraft, TrackPoint } from "./src/types";
import { useLiveAircraft } from "./src/useLiveAircraft";
import { useReplay } from "./src/useReplay";

const FONTS = "https://fonts.googleapis.com/css2?family=B612:wght@400;700&family=B612+Mono:wght@400;700&display=swap";
const WIDE = 768;

function Screen() {
	const { name, c } = useTheme();
	const { aircraft, updatedAt, status, setView } = useLiveAircraft();
	const [bbox, setBbox] = useState<[number, number, number, number] | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const [track, setTrack] = useState<TrackPoint[]>([]);
	const [sources, setSources] = useState<SourceFilter>("all");
	const [filters, setFilters] = useState<Filters>(NO_FILTERS);
	const [focus, setFocus] = useState<MapFocus | null>(null);
	const { width } = useWindowDimensions();
	const wide = width >= WIDE;
	const replay = useReplay();

	// during a replay (US12) the map shows the stored airspace instead of the live one
	const base = replay.active ? replay.aircraft : aircraft;
	const bySource = sources === "all" ? base : base.filter((a) => a.source === "receiver");
	const shown = applyFilters(bySource, filters);
	const current = shown.find((a) => a.hex === selected);
	const receiverCount = base.filter((a) => a.source === "receiver").length;
	const stored = current?.source === "receiver" && !replay.active;
	const shownTrack = replay.active && selected ? replay.trackOf(selected) : track;

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

	// only the adsb.fi aircraft in the area shown are received; the selected one is always kept
	useEffect(() => {
		if (bbox) setView({ bbox, keep: selected ? [selected] : [] });
	}, [bbox, selected, setView]);

	// a search result: centre the map on it and open its panel (US09)
	const pick = (a: LiveAircraft) => {
		setSelected(a.hex);
		setFocus({ lon: a.lon, lat: a.lat, key: Date.now() });
	};

	return (
		<View style={[styles.root, { backgroundColor: c.bg }]}>
			<StatusBar style={name === "dark" ? "light" : "dark"} />
			<View style={styles.map}>
				<LiveMap aircraft={shown} selectedHex={selected} track={shownTrack} focus={focus} onViewport={setBbox} onSelect={setSelected} />
				<TopBar
					receiverCount={receiverCount}
					networkCount={base.length - receiverCount}
					updatedAt={updatedAt}
					status={status}
					sources={sources}
					onSources={setSources}
					filters={filters}
					onFilters={setFilters}
					matches={shown}
					total={base.length}
					onPick={pick}
					compact={!wide}
					replayAt={replay.at}
					onReplay={() => replay.start(Date.now() - 60 * 60_000)}
				/>
				{replay.active && replay.at !== null ? (
					<ReplayBar
						at={replay.at}
						playing={replay.playing}
						speed={replay.speed}
						loading={replay.loading}
						error={replay.error}
						empty={!replay.loading && !replay.error && replay.aircraft.length === 0}
						onSeek={replay.start}
						onPlay={replay.setPlaying}
						onSpeed={replay.setSpeed}
						onLive={replay.stop}
						wide={wide}
					/>
				) : null}
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
