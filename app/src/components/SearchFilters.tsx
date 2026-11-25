/**
 * Search (US09) and quick filters (US08), in the title block. The map and the counts show only
 * the aircraft that match; choosing a result centres the map on it and opens its panel.
 */
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { fetchAircraft } from "../api";
import { type AltitudeBand, type Filters, hexQuery, isFiltering, keywords, NO_FILTERS } from "../filters";
import { type MessageKey, useT } from "../i18n";
import { font, type Palette, radius, size, space } from "../theme";
import { useTheme } from "../ThemeContext";
import type { KnownAircraft, LiveAircraft } from "../types";
import Segmented from "./Segmented";

const MAX_RESULTS = 5;
const BANDS: AltitudeBand[] = ["all", "ground", "low", "mid", "high"];
const utc = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;

interface SearchFiltersProps {
	filters: Filters;
	onChange: (filters: Filters) => void;
	matches: LiveAircraft[];
	total: number;
	onPick: (aircraft: LiveAircraft) => void;
}

export default function SearchFilters({ filters, onChange, matches, total, onPick }: SearchFiltersProps) {
	const { c } = useTheme();
	const { t } = useT();
	const s = useMemo(() => makeStyles(c), [c]);
	const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
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

	const Chip = ({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) => (
		<Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={[s.chip, on && s.chipOn]}>
			<Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
		</Pressable>
	);

	return (
		<View style={s.wrap}>
			<TextInput
				value={filters.query}
				onChangeText={(query) => set({ query })}
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

			<Segmented
				label={t("filter.altitude")}
				options={BANDS.map((b) => ({ value: b, label: t(`filter.altitude.${b}` as MessageKey) }))}
				value={filters.altitude}
				onChange={(altitude) => set({ altitude })}
			/>
			<View style={s.chips}>
				<Chip on={filters.emergency} label={t("filter.emergency")} onPress={() => set({ emergency: !filters.emergency })} />
				<Chip on={filters.withRoute} label={t("filter.withRoute")} onPress={() => set({ withRoute: !filters.withRoute })} />
				{isFiltering(filters) ? (
					<Pressable onPress={() => onChange(NO_FILTERS)} accessibilityRole="button" style={s.clear}>
						<Text style={s.clearText}>{t("filter.clear")}</Text>
					</Pressable>
				) : null}
			</View>
			{isFiltering(filters) ? (
				<Text style={s.note} accessibilityLiveRegion="polite">
					{t("filter.showing", { shown: matches.length, total })}
				</Text>
			) : null}
		</View>
	);
}

const makeStyles = (c: Palette) =>
	StyleSheet.create({
		wrap: { gap: space[2] },
		input: {
			fontFamily: font.code,
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
		note: { fontFamily: font.text, fontSize: size.xs, color: c.textMuted, paddingVertical: space[1] },
		chips: { flexDirection: "row", flexWrap: "wrap", gap: space[2], alignItems: "center" },
		chip: { borderWidth: 1, borderColor: c.rule, borderRadius: radius.md, paddingVertical: space[1], paddingHorizontal: space[2] },
		chipOn: { backgroundColor: c.text, borderColor: c.text },
		chipText: { fontFamily: font.text, fontSize: size.xs, color: c.textMuted },
		chipTextOn: { color: c.surface, fontWeight: "700" },
		clear: { paddingVertical: space[1] },
		clearText: { fontFamily: font.text, fontSize: size.xs, color: c.blue, textDecorationLine: "underline" },
	});
