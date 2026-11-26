/**
 * Alerts (US13): the settings section of the title block, and the alerts shown over the map.
 * Choosing an alert centres the map on the aircraft and opens its panel.
 */
import { useCallback, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { Alert, AlertReason, AlertSettings } from "../alerts";
import { type MessageKey, useT } from "../i18n";
import { font, type Palette, radius, size, space } from "../theme";
import { useTheme } from "../ThemeContext";

const MAX_WATCH = 20;
const notifications = () => Platform.OS === "web" && typeof window !== "undefined" && "Notification" in window;

/** Text of an alert, also used for browser notifications. */
export function useDescribeAlert() {
	const { t } = useT();
	return useCallback(
		(a: Alert) =>
			a.reasons
				.map((r: AlertReason) =>
					r === "emergency" && a.squawk ? t("alert.emergency", { code: a.squawk, meaning: t(`emergency.${a.squawk}` as MessageKey) }) : t(`alert.${r}` as MessageKey),
				)
				.join(" · "),
		[t],
	);
}

export function AlertControls({ settings, onChange }: { settings: AlertSettings; onChange: (s: AlertSettings) => void }) {
	const { c } = useTheme();
	const { t } = useT();
	const s = useMemo(() => makeStyles(c), [c]);
	const [entry, setEntry] = useState("");
	const set = (patch: Partial<AlertSettings>) => onChange({ ...settings, ...patch });

	const add = () => {
		const v = entry.trim().toUpperCase();
		if (v && !settings.watch.includes(v) && settings.watch.length < MAX_WATCH) set({ watch: [...settings.watch, v] });
		setEntry("");
	};

	const toggleNotify = async () => {
		if (settings.notify || !notifications()) return set({ notify: false });
		const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
		set({ notify: permission === "granted" });
	};

	// a render function, not a component: elements keep their identity across updates
	const toggle = (on: boolean, label: string, onPress: () => void) => (
		<Pressable key={label} onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={s.toggle}>
			<View style={[s.box, on && s.boxOn]}>{on ? <Text style={s.tick}>✓</Text> : null}</View>
			<Text style={s.toggleText}>{label}</Text>
		</Pressable>
	);

	return (
		<View style={s.wrap}>
			<View style={s.toggles}>
				{toggle(settings.emergency, t("alert.setting.emergency"), () => set({ emergency: !settings.emergency }))}
				{toggle(settings.military, t("alert.setting.military"), () => set({ military: !settings.military }))}
				{notifications() ? toggle(settings.notify, t("alert.setting.notify"), toggleNotify) : null}
			</View>
			<View style={s.addRow}>
				<TextInput
					value={entry}
					onChangeText={setEntry}
					onSubmitEditing={add}
					placeholder={t("alert.watch.placeholder")}
					placeholderTextColor={c.textMuted}
					accessibilityLabel={t("alert.watch.label")}
					autoCapitalize="characters"
					autoCorrect={false}
					style={s.input}
				/>
				<Pressable onPress={add} accessibilityRole="button" style={s.addButton}>
					<Text style={s.addText}>{t("alert.watch.add")}</Text>
				</Pressable>
			</View>
			{settings.watch.length ? (
				<View style={s.chips}>
					{settings.watch.map((w) => (
						<View key={w} style={s.chip}>
							<Text style={s.chipText}>{w}</Text>
							<Pressable
								onPress={() => set({ watch: settings.watch.filter((x) => x !== w) })}
								accessibilityRole="button"
								accessibilityLabel={t("alert.watch.remove", { id: w })}
							>
								<Text style={s.chipRemove}>✕</Text>
							</Pressable>
						</View>
					))}
				</View>
			) : (
				<Text style={s.note}>{t("alert.watch.hint")}</Text>
			)}
		</View>
	);
}

export function AlertToasts({ alerts, onPick, onDismiss, compact }: { alerts: Alert[]; onPick: (hex: string) => void; onDismiss: (id: number) => void; compact: boolean }) {
	const { c } = useTheme();
	const { t } = useT();
	const s = useMemo(() => makeStyles(c), [c]);
	const describe = useDescribeAlert();
	if (!alerts.length) return null;
	return (
		<View style={[s.toasts, compact ? s.toastsCompact : s.toastsWide]} accessibilityLiveRegion="assertive">
			{alerts.map((a) => {
				const danger = a.reasons.includes("emergency");
				return (
					<View key={a.id} style={[s.toast, danger && s.toastDanger]}>
						<Pressable onPress={() => onPick(a.hex)} accessibilityRole="button" style={s.toastBody}>
							<Text style={s.toastTitle}>
								{a.label} <Text style={s.toastTime}>{a.at.toISOString().slice(11, 16)} UTC</Text>
							</Text>
							<Text style={s.toastText}>{describe(a)}</Text>
						</Pressable>
						<Pressable onPress={() => onDismiss(a.id)} accessibilityRole="button" accessibilityLabel={t("alert.dismiss")} style={s.toastClose}>
							<Text style={s.chipRemove}>✕</Text>
						</Pressable>
					</View>
				);
			})}
		</View>
	);
}

const makeStyles = (c: Palette) =>
	StyleSheet.create({
		wrap: { gap: space[2] },
		toggles: { flexDirection: "row", flexWrap: "wrap", columnGap: space[4], rowGap: space[1] },
		toggle: { flexDirection: "row", alignItems: "center", gap: space[2], paddingVertical: 2 },
		box: { width: 14, height: 14, borderWidth: 1, borderColor: c.textMuted, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
		boxOn: { backgroundColor: c.text, borderColor: c.text },
		tick: { fontSize: 10, lineHeight: 12, color: c.surface, fontWeight: "700" },
		toggleText: { fontFamily: font.text, fontSize: size.xs, color: c.text },
		addRow: { flexDirection: "row", gap: space[2] },
		input: {
			flex: 1,
			fontFamily: font.text,
			fontSize: size.xs,
			color: c.text,
			backgroundColor: c.surfaceSunk,
			borderWidth: 1,
			borderColor: c.rule,
			borderRadius: radius.md,
			paddingVertical: space[1],
			paddingHorizontal: space[2],
		},
		addButton: { borderWidth: 1, borderColor: c.rule, borderRadius: radius.md, paddingVertical: space[1], paddingHorizontal: space[3], justifyContent: "center" },
		addText: { fontFamily: font.text, fontSize: size.xs, color: c.text },
		chips: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
		chip: { flexDirection: "row", alignItems: "center", gap: space[2], borderWidth: 1, borderColor: c.rule, borderRadius: radius.md, paddingVertical: 2, paddingHorizontal: space[2] },
		chipText: { fontFamily: font.code, fontSize: size.xs, color: c.text },
		chipRemove: { fontSize: size.xs, color: c.textMuted },
		note: { fontFamily: font.text, fontSize: size.xs, color: c.textMuted },
		toasts: { position: "absolute", gap: space[2] },
		toastsWide: { top: space[4], right: space[4], width: 300 },
		toastsCompact: { bottom: space[6] + space[2], left: space[2], right: space[2] },
		toast: {
			flexDirection: "row",
			backgroundColor: c.surface,
			borderWidth: 1,
			borderColor: c.rule,
			borderLeftWidth: 4,
			borderLeftColor: c.blue,
			borderRadius: radius.md,
		},
		toastDanger: { borderLeftColor: c.danger },
		toastBody: { flex: 1, paddingVertical: space[2], paddingHorizontal: space[3], gap: 2 },
		toastTitle: { fontFamily: font.code, fontSize: size.sm, fontWeight: "700", color: c.text },
		toastTime: { fontFamily: font.text, fontSize: size.xs, fontWeight: "400", color: c.textMuted },
		toastText: { fontFamily: font.text, fontSize: size.xs, color: c.text },
		toastClose: { paddingHorizontal: space[3], justifyContent: "center" },
	});
