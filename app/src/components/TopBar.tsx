/**
 * Chart title block over the map: name, receiver, connection state, search and filters, data
 * sources, altitude scale and the theme and language switches.
 */
import { type ReactNode, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { type Language, type MessageKey, useT } from "../i18n";
import { altitudeStops, font, type Palette, radius, size, space, type ThemeName } from "../theme";
import { useTheme } from "../ThemeContext";
import type { ConnectionStatus } from "../types";
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
	children?: ReactNode; // search and filters
}

export default function TopBar({ receiverCount, networkCount, updatedAt, status, sources, onSources, children }: TopBarProps) {
	const { name, c, setTheme } = useTheme();
	const { language, setLanguage, t } = useT();
	const s = useMemo(() => makeStyles(c), [c]);
	const dot = status === "live" ? c.blue : c.warning;
	const gradient = `linear-gradient(90deg, ${altitudeStops.map(([, col], i) => `${col} ${(i / (altitudeStops.length - 1)) * 100}%`).join(", ")})`;

	let text: string;
	if (status === "connecting") text = t("status.connecting");
	else if (status === "reconnecting") text = t("status.reconnecting");
	else {
		const n = networkCount
			? t("status.count", { receiver: receiverCount, network: networkCount })
			: t("status.countReceiver", { receiver: receiverCount });
		text = updatedAt ? t("status.updated", { count: n, time: utc(updatedAt) }) : n;
	}

	return (
		<View style={s.block}>
			<View style={s.head}>
				<View>
					<Text style={s.title}>SkyTracer</Text>
					<Text style={s.subtitle}>{t("receiver")}</Text>
				</View>
				<Segmented label={t("language.group")} options={LANGUAGES} value={language} onChange={setLanguage} />
			</View>

			<View style={s.status}>
				<View style={[s.dot, { backgroundColor: dot }]} />
				<Text style={s.statusText}>{text}</Text>
			</View>

			{children}

			{/* sources legend and filter only when the adsb.fi network is contributing */}
			{networkCount > 0 && (
				<>
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
					<Segmented
						label={t("sources.group")}
						options={[
							{ value: "all", label: t("sources.all") },
							{ value: "receiver", label: t("sources.receiver") },
						]}
						value={sources}
						onChange={onSources}
					/>
				</>
			)}

			<View>
				<View style={[s.scale, { backgroundImage: gradient } as object]} />
				<View style={s.ticks}>
					{altitudeStops.map(([ft]) => (
						<Text key={ft} style={s.tick}>
							{ft / 1000}
						</Text>
					))}
				</View>
				<Text style={s.unit}>{t("scale.caption")}</Text>
			</View>

			<Segmented
				label={t("theme.group")}
				options={THEMES.map((th) => ({ value: th, label: t(`theme.${th}` as MessageKey) }))}
				value={name}
				onChange={setTheme}
			/>
		</View>
	);
}

const makeStyles = (c: Palette) =>
	StyleSheet.create({
		block: {
			position: "absolute",
			top: space[4],
			left: space[4],
			width: 300,
			maxWidth: "80%",
			backgroundColor: c.surface,
			borderWidth: 1,
			borderColor: c.rule,
			borderRadius: radius.md,
			padding: space[4],
			gap: space[3],
		},
		head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
		title: { fontFamily: font.text, fontSize: size.lg, fontWeight: "700", color: c.text },
		subtitle: { fontFamily: font.text, fontSize: size.sm, color: c.textMuted, marginTop: 2 },
		status: { flexDirection: "row", alignItems: "center", gap: space[2] },
		dot: { width: 8, height: 8, borderRadius: 4 },
		statusText: { flex: 1, fontFamily: font.text, fontSize: size.xs, color: c.text },
		legend: { flexDirection: "row", flexWrap: "wrap", columnGap: space[4], rowGap: space[1] },
		legendItem: { flexDirection: "row", alignItems: "center", gap: space[2] },
		mark: { width: 10, height: 10, borderRadius: 5 },
		markOutline: { borderWidth: 1.5, borderColor: c.text },
		legendText: { fontFamily: font.text, fontSize: size.xs, color: c.text },
		scale: { height: 6, borderRadius: radius.sm },
		ticks: { flexDirection: "row", justifyContent: "space-between", marginTop: space[1] },
		tick: { fontFamily: font.text, fontSize: size.xs, color: c.textMuted },
		unit: { fontFamily: font.text, fontSize: size.xs, color: c.textMuted, marginTop: space[1] },
	});
