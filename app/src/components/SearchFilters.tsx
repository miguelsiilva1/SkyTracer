/**
 * Search (US09) and quick filters (US08), shown in the title block. The map and the counts show
 * only the aircraft that match; choosing a result centres the map on it and opens its panel.
 */
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { fetchAircraft } from "../api";
import { type AltitudeBand, type Filters, hexQuery, isFiltering, keywords, NO_FILTERS } from "../filters";
import { type MessageKey, useT } from "../i18n";
import { font, type Palette, radius, size, space } from "../theme";
import { useTheme } from "../ThemeContext";
import type { KnownAircraft, LiveAircraft } from "../types";
import Segmented from "./Segmented";
import type { SourceFilter } from "./TopBar";

const MAX_RESULTS = 5;
const BANDS: AltitudeBand[] = ["all", "ground", "low", "mid", "high"];
const utc = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;

/** Search field and its results. */
export function SearchBox({
	filters,
	onChange,
	matches,
	onPick,
}: {
	filters: Filters;
	onChange: (filters: Filters) => void;
	matches: LiveAircraft[];
	onPick: (aircraft: LiveAircraft) => void;
}) {
	const { c } = useTheme();
	const { t } = useT();
	const s = useMemo(() => makeStyles(c), [c]);
	const searching = keywords(filters.query).length > 0;

	// an ICAO address that is not on the map now may still be known from the stored history
	const hex = matches.length ? null : hexQuery(filters.query);
	const [known, setKnown] = useState<KnownAircraft | null | undefined>(undefined);
	useEffect(() => {
		setKnown(undefined);
		if (!hex) return;
		const ctrl = new AbortController();
		fetchAircraft(hex, ctrl.signal)
			.then(setKnown)
			.catch(() => {});
		return () => ctrl.abort();
	}, [hex]);

	let empty = t("search.none");
	if (hex && known?.live) empty = t("search.hidden");
	else if (hex && known) {
		const name = [known.registration, known.type_name ?? known.icao_type].filter(Boolean).join(" ") || hex.toUpperCase();
		empty = known.last_seen ? t("search.lastSeen", { name, time: utc(known.last_seen) }) : t("search.notNow", { name });
	}

	return (
		<View style={s.search}>
			<TextInput
				value={filters.query}
				onChangeText={(query) => onChange({ ...filters, query })}
				onSubmitEditing={() => matches[0] && onPick(matches[0])}
				placeholder={t("search.placeholder")}
				placeholderTextColor={c.textMuted}
				accessibilityLabel={t("search.label")}
				autoCapitalize="characters"
				autoCorrect={false}
				style={s.input}
			/>
			{searching ? (
				<View accessibilityRole="list">
					{matches.length ? (
						<>
							{matches.slice(0, MAX_RESULTS).map((a) => {
								const route = [a.origin_iata ?? a.origin_icao, a.dest_iata ?? a.dest_icao].filter(Boolean).join(" → ");
								return (
									<Pressable key={a.hex} onPress={() => onPick(a)} accessibilityRole="button" style={s.result}>
										<Text style={s.resultCode}>{a.callsign ?? a.registration ?? a.hex.toUpperCase()}</Text>
										<Text style={s.resultInfo} numberOfLines={1}>
											{[a.icao_type, route].filter(Boolean).join("  ")}
										</Text>
									</Pressable>
								);
							})}
							{matches.length > MAX_RESULTS ? (
								<Text style={s.note}>{t("search.more", { count: matches.length - MAX_RESULTS })}</Text>
							) : null}
						</>
					) : (
						<Text style={s.note}>{empty}</Text>
					)}
				</View>
			) : null}
		</View>
	);
}

/** A labelled control: a small label above the control. */
export function Row({ label, children }: { label: string; children: ReactNode }) {
	const { c } = useTheme();
	const s = useMemo(() => makeStyles(c), [c]);
	return (
		<View style={s.row}>
			<Text style={s.rowLabel}>{label}</Text>
			<View style={s.rowControl}>{children}</View>
		</View>
	);
}

/** Altitude, source and the emergency and route filters, with the count and a clear action. */
export function FilterControls({
	filters,
	onChange,
	sources,
	onSources,
	showSources,
	shown,
	total,
}: {
	filters: Filters;
	onChange: (filters: Filters) => void;
	sources: SourceFilter;
	onSources: (value: SourceFilter) => void;
	showSources: boolean;
	shown: number;
	total: number;
}) {
	const { c } = useTheme();
	const { t } = useT();
	const s = useMemo(() => makeStyles(c), [c]);
	const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
	const active = isFiltering(filters) || sources !== "all";

	const Toggle = ({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) => (
		<Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={s.toggle}>
			<View style={[s.box, on && s.boxOn]}>{on ? <Text style={s.tick}>✓</Text> : null}</View>
			<Text style={s.toggleText}>{label}</Text>
		</Pressable>
	);

	return (
		<View style={s.filters}>
			<Row label={t("filter.altitude")}>
				<Segmented
					label={t("filter.altitude")}
					options={BANDS.map((b) => ({ value: b, label: t(`filter.altitude.${b}` as MessageKey) }))}
					value={filters.altitude}
					onChange={(altitude) => set({ altitude })}
				/>
			</Row>
			{showSources ? (
				<Row label={t("filter.source")}>
					<Segmented
						label={t("sources.group")}
						options={[
							{ value: "all", label: t("sources.all") },
							{ value: "receiver", label: t("sources.receiver") },
						]}
						value={sources}
						onChange={onSources}
					/>
				</Row>
			) : null}
			<Row label={t("filter.only")}>
				<View style={s.toggles}>
					<Toggle on={filters.emergency} label={t("filter.emergency")} onPress={() => set({ emergency: !filters.emergency })} />
					<Toggle on={filters.withRoute} label={t("filter.withRoute")} onPress={() => set({ withRoute: !filters.withRoute })} />
				</View>
			</Row>
			{active ? (
				<View style={s.summary}>
					<Text style={s.note} accessibilityLiveRegion="polite">
						{t("filter.showing", { shown, total })}
					</Text>
					<Pressable
						onPress={() => {
							onChange({ ...NO_FILTERS, query: filters.query });
							onSources("all");
						}}
						accessibilityRole="button"
					>
						<Text style={s.clear}>{t("filter.clear")}</Text>
					</Pressable>
				</View>
			) : null}
		</View>
	);
}

/** Number of active filters (not counting the search), shown on the compact filters button. */
export function activeFilters(filters: Filters, sources: SourceFilter): number {
	return (filters.altitude !== "all" ? 1 : 0) + (filters.emergency ? 1 : 0) + (filters.withRoute ? 1 : 0) + (sources !== "all" ? 1 : 0);
}

const makeStyles = (c: Palette) =>
	StyleSheet.create({
		search: { gap: space[2] },
		input: {
			fontFamily: font.text,
			fontSize: size.sm,
			color: c.text,
			backgroundColor: c.surfaceSunk,
			borderWidth: 1,
			borderColor: c.rule,
			borderRadius: radius.md,
			paddingVertical: space[2],
			paddingHorizontal: space[3],
		},
		result: { flexDirection: "row", alignItems: "baseline", gap: space[2], paddingVertical: space[1], borderBottomWidth: 1, borderBottomColor: c.rule },
		resultCode: { fontFamily: font.code, fontSize: size.sm, fontWeight: "700", color: c.text },
		resultInfo: { flex: 1, fontFamily: font.code, fontSize: size.xs, color: c.textMuted },
		note: { fontFamily: font.text, fontSize: size.xs, color: c.textMuted },
		filters: { gap: space[3] },
		row: { gap: space[1] },
		rowLabel: { fontFamily: font.text, fontSize: size.xs, color: c.textMuted },
		rowControl: { flexDirection: "row" },
		toggles: { flexDirection: "row", flexWrap: "wrap", columnGap: space[4], rowGap: space[1] },
		toggle: { flexDirection: "row", alignItems: "center", gap: space[2], paddingVertical: 2 },
		box: { width: 14, height: 14, borderWidth: 1, borderColor: c.textMuted, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
		boxOn: { backgroundColor: c.text, borderColor: c.text },
		tick: { fontSize: 10, lineHeight: 12, color: c.surface, fontWeight: "700" },
		toggleText: { fontFamily: font.text, fontSize: size.xs, color: c.text },
		summary: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
		clear: { fontFamily: font.text, fontSize: size.xs, color: c.blue, textDecorationLine: "underline" },
	});
