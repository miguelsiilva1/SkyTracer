/**
 * Chart title block over the map, in ruled sections: title and connection state, search,
 * filters, legend, and the theme and language settings. On narrow screens it collapses to a
 * bar with the title, the state and the search; the other sections open under a filters button.
 */
import { type ReactNode, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Filters } from "../filters";
import { type Language, type MessageKey, useT } from "../i18n";
import { altitudeStops, font, type Palette, radius, size, space, type ThemeName } from "../theme";
import { useTheme } from "../ThemeContext";
import type { ConnectionStatus, LiveAircraft } from "../types";
import type { AlertSettings } from "../alerts";
import { AlertControls } from "./Alerts";
import { activeFilters, FilterControls, Row, SearchBox } from "./SearchFilters";
import Segmented from "./Segmented";

const utc = (d: Date) => d.toISOString().slice(11, 19);
const THEMES: ThemeName[] = ["light", "dark", "standard"];
const LANGUAGES: { value: Language; label: string }[] = [
	{ value: "en", label: "EN" },
	{ value: "pt", label: "PT" },
];

export type SourceFilter = "all" | "receiver";

interface TopBarProps {
	receiverCount: number;
	networkCount: number;
	updatedAt: Date | null;
	status: ConnectionStatus;
	sources: SourceFilter;
	onSources: (value: SourceFilter) => void;
	filters: Filters;
	onFilters: (filters: Filters) => void;
	matches: LiveAircraft[];
	total: number;
	onPick: (aircraft: LiveAircraft) => void;
	compact: boolean;
	replayAt: number | null; // replay time, or null when live
	onReplay: () => void;
	alertSettings: AlertSettings;
	onAlertSettings: (s: AlertSettings) => void;
}

export default function TopBar(p: TopBarProps) {
	const { name, c, setTheme } = useTheme();
	const { language, setLanguage, t } = useT();
	const s = useMemo(() => makeStyles(c), [c]);
	const [open, setOpen] = useState(false);
	const dot = p.status === "live" && p.replayAt === null ? c.blue : c.warning;
	const gradient = `linear-gradient(90deg, ${altitudeStops.map(([, col], i) => `${col} ${(i / (altitudeStops.length - 1)) * 100}%`).join(", ")})`;
	const hasNetwork = p.networkCount > 0;
	const nActive = activeFilters(p.filters, p.sources);

	let text: string;
	if (p.replayAt !== null) {
		const iso = new Date(p.replayAt).toISOString();
		text = t("replay.status", { time: `${iso.slice(0, 10)} ${iso.slice(11, 16)}` });
	} else if (p.status === "connecting") text = t("status.connecting");
	else if (p.status === "reconnecting") text = t("status.reconnecting");
	else if (p.compact) {
		const total = p.receiverCount + p.networkCount;
		text = p.updatedAt ? t("status.short", { total, time: utc(p.updatedAt).slice(0, 5) }) : String(total);
	} else {
		const n = hasNetwork
			? t("status.count", { receiver: p.receiverCount, network: p.networkCount })
			: t("status.countReceiver", { receiver: p.receiverCount });
		text = p.updatedAt ? t("status.updated", { count: n, time: utc(p.updatedAt) }) : n;
	}

	const section = (key: string, title: string | null, children: ReactNode) => (
		<View key={key} style={s.section}>
			{title ? <Text style={s.sectionTitle}>{title}</Text> : null}
			{children}
		</View>
	);

	const details = (
		<>
			{section(
				"filters",
				t("section.filters"),
				<FilterControls
					filters={p.filters}
					onChange={p.onFilters}
					sources={p.sources}
					onSources={p.onSources}
					showSources={hasNetwork}
					shown={p.matches.length}
					total={p.total}
				/>,
			)}

			{section("alerts", t("section.alerts"), <AlertControls settings={p.alertSettings} onChange={p.onAlertSettings} />)}

			{section(
				"legend",
				t("section.legend"),
				<>
				<View>
					<View style={[s.scale, { backgroundImage: gradient } as object]} />
					<View style={s.ticks}>
						{altitudeStops.map(([ft]) => (
							<Text key={ft} style={s.tick}>
								{ft / 1000}
							</Text>
						))}
					</View>
					<Text style={s.caption}>{t("scale.caption")}</Text>
				</View>
				{hasNetwork ? (
					<View style={s.legend}>
						<View style={s.legendItem}>
							<View style={[s.mark, { backgroundColor: c.text }]} />
							<Text style={s.legendText}>{t("legend.receiver")}</Text>
						</View>
						<View style={s.legendItem}>
							<View style={[s.mark, s.markOutline]} />
							<Text style={s.legendText}>{t("legend.network")}</Text>
						</View>
					</View>
				) : null}
				</>,
			)}

			{section(
				"settings",
				null,
				<View style={s.settings}>
				<Row label={t("theme.label")}>
					<Segmented
						label={t("theme.group")}
						options={THEMES.map((th) => ({ value: th, label: t(`theme.${th}` as MessageKey) }))}
						value={name}
						onChange={setTheme}
					/>
				</Row>
				<Row label={t("language.group")}>
					<Segmented label={t("language.group")} options={LANGUAGES} value={language} onChange={setLanguage} />
				</Row>
				</View>,
			)}
		</>
	);

	return (
		<View style={[s.block, p.compact ? s.blockCompact : s.blockWide]}>
			<ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
				<View style={p.compact ? s.headCompact : s.head}>
					<Text style={p.compact ? s.titleCompact : s.title}>SkyTracer</Text>
					{p.compact ? null : <Text style={s.subtitle}>{t("receiver")}</Text>}
					<View style={s.status}>
						<View style={[s.dot, { backgroundColor: dot }]} />
						<Text style={s.statusText}>{text}</Text>
						{p.replayAt === null ? (
							<Pressable onPress={p.onReplay} accessibilityRole="button" accessibilityLabel={t("replay.open")} style={s.replay}>
								<Text style={s.replayText}>{t("replay.tag")}</Text>
							</Pressable>
						) : null}
					</View>
				</View>

				<View style={p.compact ? s.searchCompact : s.section}>
					<View style={p.compact ? s.grow : undefined}>
						<SearchBox filters={p.filters} onChange={p.onFilters} matches={p.matches} onPick={p.onPick} />
					</View>
					{p.compact ? (
						<Pressable
							onPress={() => setOpen(!open)}
							accessibilityRole="button"
							accessibilityState={{ expanded: open }}
							accessibilityLabel={open ? t("filters.close") : t("filters.open")}
							style={[s.filtersButton, open && s.filtersButtonOn]}
						>
							<Text style={[s.filtersText, open && s.filtersTextOn]}>
								{open ? "✕" : nActive ? `${t("filters.open")} · ${nActive}` : t("filters.open")}
							</Text>
						</Pressable>
					) : null}
				</View>

				{!p.compact || open ? details : null}
			</ScrollView>
		</View>
	);
}

const makeStyles = (c: Palette) =>
	StyleSheet.create({
		block: {
			position: "absolute",
			top: space[4],
			left: space[4],
			backgroundColor: c.surface,
			borderWidth: 1,
			borderColor: c.rule,
			borderRadius: radius.md,
		},
		blockWide: { width: 340, maxHeight: "94%" },
		blockCompact: { top: space[2], left: space[2], right: space[2], maxHeight: "80%" },
		content: { paddingHorizontal: space[4] },
		head: { paddingVertical: space[4], gap: space[1] },
		headCompact: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[3], paddingTop: space[3], paddingBottom: space[2] },
		title: { fontFamily: font.text, fontSize: size.lg, fontWeight: "700", color: c.text },
		titleCompact: { fontFamily: font.text, fontSize: size.md, fontWeight: "700", color: c.text },
		subtitle: { fontFamily: font.text, fontSize: size.sm, color: c.textMuted },
		status: { flexDirection: "row", alignItems: "center", gap: space[2], marginTop: space[1], flexShrink: 1 },
		dot: { width: 8, height: 8, borderRadius: 4 },
		statusText: { flexShrink: 1, fontFamily: font.text, fontSize: size.xs, color: c.text },
		replay: { marginLeft: "auto", borderWidth: 1, borderColor: c.rule, borderRadius: radius.md, paddingVertical: 2, paddingHorizontal: space[2] },
		replayText: { fontFamily: font.text, fontSize: size.xs, color: c.text },
		section: { gap: space[3], paddingVertical: space[4], borderTopWidth: 1, borderColor: c.rule },
		grow: { flex: 1 },
		settings: { flexDirection: "row", flexWrap: "wrap", columnGap: space[5], rowGap: space[3] },
		searchCompact: { flexDirection: "row", alignItems: "flex-start", gap: space[2], paddingBottom: space[3] },
		sectionTitle: { fontFamily: font.text, fontSize: size.xs, fontWeight: "700", color: c.textMuted, letterSpacing: 0.6, textTransform: "uppercase" },
		filtersButton: { borderWidth: 1, borderColor: c.rule, borderRadius: radius.md, paddingVertical: space[2], paddingHorizontal: space[3] },
		filtersButtonOn: { backgroundColor: c.text, borderColor: c.text },
		filtersText: { fontFamily: font.text, fontSize: size.sm, color: c.text },
		filtersTextOn: { color: c.surface, fontWeight: "700" },
		scale: { height: 6, borderRadius: radius.sm },
		ticks: { flexDirection: "row", justifyContent: "space-between", marginTop: space[1] },
		tick: { fontFamily: font.text, fontSize: size.xs, color: c.textMuted },
		caption: { fontFamily: font.text, fontSize: size.xs, color: c.textMuted, marginTop: space[1] },
		legend: { flexDirection: "row", flexWrap: "wrap", columnGap: space[4], rowGap: space[1] },
		legendItem: { flexDirection: "row", alignItems: "center", gap: space[2] },
		mark: { width: 10, height: 10, borderRadius: 5 },
		markOutline: { borderWidth: 1.5, borderColor: c.text },
		legendText: { fontFamily: font.text, fontSize: size.xs, color: c.text },
	});
