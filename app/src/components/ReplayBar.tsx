/**
 * Replay controls (US12), at the bottom of the map: the replay time in UTC, play and pause,
 * speed, jumps, a date and time field, and the way back to live. The warning colour marks that
 * the map is not showing the present.
 */
import { createElement, useMemo } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useT } from "../i18n";
import { font, type Palette, radius, size, space } from "../theme";
import { useTheme } from "../ThemeContext";
import { RETENTION_MS, type Speed, SPEEDS } from "../useReplay";
import Segmented from "./Segmented";

const MINUTE = 60_000;
const JUMPS: [string, number][] = [
	["−1 h", -60 * MINUTE],
	["−10 min", -10 * MINUTE],
	["+10 min", 10 * MINUTE],
	["+1 h", 60 * MINUTE],
];

interface ReplayBarProps {
	at: number;
	playing: boolean;
	speed: Speed;
	loading: boolean;
	error: boolean;
	empty: boolean;
	onSeek: (t: number) => void;
	onPlay: (playing: boolean) => void;
	onSpeed: (speed: Speed) => void;
	onLive: () => void;
	wide: boolean; // leave room for the title block on wide screens
}

export default function ReplayBar(p: ReplayBarProps) {
	const { c } = useTheme();
	const { t } = useT();
	const s = useMemo(() => makeStyles(c), [c]);
	const iso = new Date(p.at).toISOString();
	const now = Date.now();

	let note: string | null = null;
	if (p.error) note = t("replay.error");
	else if (p.loading) note = t("replay.loading");
	else if (p.empty) note = t("replay.empty");

	// a render function, not a component: elements keep their identity across updates
	const button = (label: string, onPress: () => void, strong = false) => (
		<Pressable key={label} onPress={onPress} accessibilityRole="button" style={[s.button, strong && s.buttonStrong]}>
			<Text style={[s.buttonText, strong && s.buttonTextStrong]}>{label}</Text>
		</Pressable>
	);

	return (
		<View style={[s.bar, p.wide ? s.barWide : s.barCompact]} accessibilityRole="toolbar" accessibilityLabel={t("replay.tag")}>
			<View style={s.head}>
				<Text style={s.tag}>{t("replay.tag")}</Text>
				<Text style={s.time} accessibilityLiveRegion="polite">
					{iso.slice(0, 10)} {iso.slice(11, 19)} UTC
				</Text>
				<View style={s.grow} />
				{button(t("replay.live"), p.onLive)}
			</View>

			<View style={s.controls}>
				{button(p.playing ? t("replay.pause") : t("replay.play"), () => p.onPlay(!p.playing), true)}
				{JUMPS.map(([label, ms]) => button(label, () => p.onSeek(p.at + ms)))}
				<Segmented
					label={t("replay.speed")}
					options={SPEEDS.map((v) => ({ value: String(v), label: `${v}×` }))}
					value={String(p.speed)}
					onChange={(v) => p.onSpeed(Number(v) as Speed)}
				/>
				{Platform.OS === "web"
					? createElement("input", {
							type: "datetime-local",
							"aria-label": t("replay.jump"),
							value: iso.slice(0, 16),
							min: new Date(now - RETENTION_MS).toISOString().slice(0, 16),
							max: new Date(now).toISOString().slice(0, 16),
							onChange: (e: { target: { value: string } }) => {
								const v = Date.parse(`${e.target.value}Z`);
								if (Number.isFinite(v)) p.onSeek(v);
							},
							style: {
								fontFamily: font.text,
								fontSize: size.xs,
								color: c.text,
								background: c.surfaceSunk,
								border: `1px solid ${c.rule}`,
								borderRadius: radius.md,
								padding: `${space[1]}px ${space[2]}px`,
								colorScheme: "light dark",
							},
						})
					: null}
			</View>
			{note ? <Text style={s.note}>{note}</Text> : null}
		</View>
	);
}

const makeStyles = (c: Palette) =>
	StyleSheet.create({
		bar: {
			position: "absolute",
			bottom: space[6] + space[2], // above the map attribution
			backgroundColor: c.surface,
			borderWidth: 1,
			borderColor: c.warning,
			borderTopWidth: 4,
			borderRadius: radius.md,
			padding: space[3],
			gap: space[2],
		},
		barWide: { left: 340 + space[4] * 2, right: space[6] * 2 },
		barCompact: { left: space[2], right: space[2] },
		head: { flexDirection: "row", alignItems: "center", gap: space[3] },
		tag: { fontFamily: font.text, fontSize: size.xs, fontWeight: "700", color: c.warning, letterSpacing: 0.6, textTransform: "uppercase" },
		time: { fontFamily: font.code, fontSize: size.md, fontWeight: "700", color: c.text },
		grow: { flex: 1 },
		controls: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
		button: { borderWidth: 1, borderColor: c.rule, borderRadius: radius.md, paddingVertical: space[1], paddingHorizontal: space[2] },
		buttonStrong: { backgroundColor: c.text, borderColor: c.text },
		buttonText: { fontFamily: font.text, fontSize: size.xs, color: c.text },
		buttonTextStrong: { color: c.surface, fontWeight: "700" },
		note: { fontFamily: font.text, fontSize: size.xs, color: c.textMuted },
	});
