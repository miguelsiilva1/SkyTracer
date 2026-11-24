/**
 * Aircraft panel laid out as an ATC flight progress strip (US07): callsign and identification,
 * route (US03), live values in ruled boxes, and the photo with its credit (US04). The values
 * keep updating with every WebSocket message.
 */
import { useMemo } from "react";
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { altitudeColor } from "../altitude";
import { font, type Palette, radius, size, space } from "../theme";
import { type MessageKey, useT } from "../i18n";
import { useTheme } from "../ThemeContext";
import type { LiveAircraft } from "../types";

const EMERGENCY = new Set(["7500", "7600", "7700"]);

const num = (n: number | null, digits = 0) => (n === null ? "—" : n.toLocaleString("en-GB", { maximumFractionDigits: digits }));

const ADSBFI = "https://adsb.fi";

/** Renders a translated text whose `{network}` placeholder becomes the adsb.fi link. */
function WithNetworkLink({ text, linkStyle }: { text: string; linkStyle: object }) {
	const [before, after = ""] = text.split("{network}");
	return (
		<>
			{before}
			<Text style={linkStyle} accessibilityRole="link" onPress={() => Linking.openURL(ADSBFI)}>
				adsb.fi
			</Text>
			{after}
		</>
	);
}

export default function AircraftPanel({ aircraft: a, onClose }: { aircraft: LiveAircraft; onClose: () => void }) {
	const { c } = useTheme();
	const { t } = useT();
	const s = useMemo(() => makeStyles(c), [c]);
	const emergency = a.squawk && EMERGENCY.has(a.squawk) ? t(`emergency.${a.squawk}` as MessageKey) : undefined;
	const hasRoute = Boolean(a.origin_iata || a.origin_icao || a.dest_iata || a.dest_icao);
	const edge = altitudeColor(a.altitude_ft, a.on_ground);
	const climbing = a.vert_rate_fpm !== null && Math.abs(a.vert_rate_fpm) >= 300;
	const fromReceiver = a.source === "receiver";
	const x = a.extra;
	const extras: { label: string; value: string; unit?: string }[] = x
		? [
				{ label: t("extra.altGeom"), value: num(x.alt_geom_ft), unit: "ft" },
				{ label: t("extra.tas"), value: num(x.tas_kt), unit: "kt" },
				{ label: t("extra.ias"), value: num(x.ias_kt), unit: "kt" },
				{ label: t("extra.mach"), value: x.mach === null ? "—" : x.mach.toFixed(3) },
				{
					label: t("extra.wind"),
					value: x.wind_dir_deg === null || x.wind_speed_kt === null ? "—" : `${Math.round(x.wind_dir_deg)}° / ${Math.round(x.wind_speed_kt)}`,
					unit: "kt",
				},
				{ label: t("extra.oat"), value: num(x.oat_c), unit: "°C" },
			].filter((e) => e.value !== "—")
		: [];

	const Box = ({ i, label, value, unit, code, tint }: { i: number; label: string; value: string; unit?: string; code?: boolean; tint?: string }) => (
		<View style={[s.box, i % 2 === 0 && s.boxLeft, i >= 6 && s.boxLast]}>
			<Text style={s.label}>{label}</Text>
			<Text style={[code ? s.code : s.value, tint ? { color: tint } : null]}>
				{value}
				{unit && value !== "—" ? <Text style={s.unit}> {unit}</Text> : null}
			</Text>
		</View>
	);

	return (
		<View style={s.panel}>
			<ScrollView contentContainerStyle={s.scroll}>
				<View style={s.strip}>
					<View style={[s.edge, { backgroundColor: edge }]} />
					<View style={{ flex: 1 }}>
						<View style={s.header}>
							<View style={{ flex: 1 }}>
								<Text style={s.callsign}>{a.callsign ?? a.hex.toUpperCase()}</Text>
								<Text style={s.identity}>
									{[a.registration, a.type_name ?? a.icao_type].filter(Boolean).join("  ") || t("panel.notIdentified")}
								</Text>
								{a.airline_name || a.operator ? <Text style={s.operator}>{a.airline_name ?? a.operator}</Text> : null}
							</View>
							<Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t("panel.close")} style={s.close}>
								<Text style={s.closeText}>✕</Text>
							</Pressable>
						</View>

						<View style={[s.source, fromReceiver ? s.sourceReceiver : s.sourceNetwork]}>
							<View style={[s.mark, fromReceiver ? { backgroundColor: c.text } : s.markOutline]} />
							<Text style={s.sourceText}>
								{fromReceiver ? t("source.receiver") : <WithNetworkLink text={t("source.network")} linkStyle={s.link} />}
							</Text>
						</View>

						{emergency ? (
							<View style={s.alert}>
								<Text style={s.alertText}>
									{t("emergency.banner", { code: a.squawk as string, meaning: emergency })}
								</Text>
							</View>
						) : null}

						{hasRoute ? (
							<View style={s.route}>
								<View style={s.airport}>
									<Text style={s.iata}>{a.origin_iata ?? a.origin_icao ?? "—"}</Text>
									<Text style={s.airportName} numberOfLines={2}>{a.origin_name ?? ""}</Text>
								</View>
								<View style={s.leg} accessibilityLabel={t("panel.routeTo")}>
									<View style={s.legLine} />
									<View style={s.legDot} />
								</View>
								<View style={[s.airport, { alignItems: "flex-end" }]}>
									<Text style={s.iata}>{a.dest_iata ?? a.dest_icao ?? "—"}</Text>
									<Text style={[s.airportName, { textAlign: "right" }]} numberOfLines={2}>{a.dest_name ?? ""}</Text>
								</View>
							</View>
						) : (
							<Text style={s.noRoute}>{t("panel.routeUnknown")}</Text>
						)}

						<View style={s.grid}>
							<Box i={0} label={t("panel.altitude")} value={a.on_ground ? t("panel.onGround") : num(a.altitude_ft)} unit="ft" tint={edge} />
							<Box i={1} label={t("panel.groundSpeed")} value={num(a.speed_kt)} unit="kt" />
							<Box i={2} label={t("panel.track")} value={a.track_deg === null ? "—" : `${Math.round(a.track_deg)}°`} />
							<Box
								i={3}
								label={climbing ? t(a.vert_rate_fpm! > 0 ? "panel.climbing" : "panel.descending") : t("panel.verticalRate")}
								value={num(a.vert_rate_fpm)}
								unit="ft/min"
							/>
							<Box i={4} label={t("panel.squawk")} value={a.squawk ?? "—"} code tint={emergency ? c.danger : undefined} />
							<Box i={5} label={t("panel.icao")} value={a.hex.toUpperCase()} code />
							<Box i={6} label={t("panel.signal")} value={fromReceiver ? num(a.rssi_dbfs, 1) : "—"} unit="dBFS" />
							<Box i={7} label={t("panel.positionFrom")} value={a.mlat ? "MLAT" : "ADS-B"} />
						</View>

						{extras.length ? (
							<View style={s.extra}>
								<Text style={s.extraTitle}>
									<WithNetworkLink text={t("extra.title")} linkStyle={s.link} />
								</Text>
								<View style={s.extraGrid}>
									{extras.map((e) => (
										<View key={e.label} style={s.extraItem}>
											<Text style={s.label}>{e.label}</Text>
											<Text style={s.value}>
												{e.value}
												{e.unit ? <Text style={s.unit}> {e.unit}</Text> : null}
											</Text>
										</View>
									))}
								</View>
							</View>
						) : null}
						{!fromReceiver ? <Text style={s.note}>{t("source.noTrack")}</Text> : null}
					</View>
				</View>

				{a.photo_url ? (
					<View>
						<Image
							source={{ uri: a.photo_url }}
							style={s.photo}
							resizeMode="cover"
							accessibilityLabel={t("panel.photoOf", { aircraft: a.registration ?? a.hex.toUpperCase() })}
						/>
						{a.photo_credit ? (
							<Text
								style={s.credit}
								accessibilityRole={a.photo_link ? "link" : undefined}
								onPress={a.photo_link ? () => Linking.openURL(a.photo_link as string) : undefined}
							>
								{t("panel.photoBy", { name: a.photo_credit })}
							</Text>
						) : null}
					</View>
				) : null}
			</ScrollView>
		</View>
	);
}

const makeStyles = (c: Palette) =>
	StyleSheet.create({
		panel: { flex: 1, backgroundColor: c.bg, borderLeftWidth: 1, borderColor: c.rule },
		scroll: { padding: space[4], gap: space[4] },
		strip: {
			flexDirection: "row",
			backgroundColor: c.surface,
			borderWidth: 1,
			borderColor: c.rule,
			borderRadius: radius.sm,
			overflow: "hidden",
		},
		edge: { width: 6 },
		header: { flexDirection: "row", alignItems: "flex-start", padding: space[3] },
		callsign: { fontFamily: font.code, fontSize: size.xl, fontWeight: "700", color: c.text, letterSpacing: 1 },
		identity: { fontFamily: font.text, fontSize: size.sm, color: c.text, marginTop: space[1] },
		operator: { fontFamily: font.text, fontSize: size.sm, color: c.textMuted, marginTop: 2 },
		close: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
		closeText: { fontSize: size.md, color: c.textMuted },
		alert: { backgroundColor: c.danger, paddingVertical: space[2], paddingHorizontal: space[3] },
		alertText: { fontFamily: font.text, fontSize: size.sm, fontWeight: "700", color: c.surface },
		route: {
			flexDirection: "row",
			alignItems: "flex-start",
			gap: space[2],
			padding: space[3],
			borderTopWidth: 1,
			borderColor: c.rule,
		},
		airport: { flex: 1 },
		iata: { fontFamily: font.code, fontSize: size.xxl, fontWeight: "700", color: c.text },
		airportName: { fontFamily: font.text, fontSize: size.xs, color: c.textMuted, marginTop: 2 },
		leg: { width: 56, height: 40, justifyContent: "center" },
		legLine: { height: 2, backgroundColor: c.magenta },
		legDot: { position: "absolute", right: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: c.magenta },
		noRoute: {
			fontFamily: font.text,
			fontSize: size.sm,
			color: c.textMuted,
			padding: space[3],
			borderTopWidth: 1,
			borderColor: c.rule,
		},
		grid: { flexDirection: "row", flexWrap: "wrap", borderTopWidth: 1, borderColor: c.rule },
		box: {
			width: "50%",
			paddingVertical: space[2],
			paddingHorizontal: space[3],
			borderColor: c.rule,
			borderBottomWidth: 1,
		},
		boxLeft: { borderRightWidth: 1 },
		boxLast: { borderBottomWidth: 0 },
		label: { fontFamily: font.text, fontSize: size.xs, color: c.textMuted },
		value: { fontFamily: font.text, fontSize: size.lg, color: c.text, marginTop: 2 },
		code: { fontFamily: font.code, fontSize: size.lg, color: c.text, marginTop: 2 },
		unit: { fontFamily: font.text, fontSize: size.xs, color: c.textMuted },
		source: { flexDirection: "row", alignItems: "flex-start", gap: space[2], paddingVertical: space[2], paddingHorizontal: space[3], borderTopWidth: 1, borderColor: c.rule },
		sourceReceiver: { backgroundColor: c.surface },
		sourceNetwork: { backgroundColor: c.surfaceSunk },
		sourceText: { flex: 1, fontFamily: font.text, fontSize: size.xs, color: c.text },
		mark: { width: 10, height: 10, borderRadius: 5, marginTop: 2 },
		markOutline: { borderWidth: 1.5, borderColor: c.text },
		link: { color: c.magenta, textDecorationLine: "underline" },
		extra: { borderTopWidth: 1, borderColor: c.rule, padding: space[3], backgroundColor: c.surfaceSunk, gap: space[2] },
		extraTitle: { fontFamily: font.text, fontSize: size.xs, color: c.textMuted },
		extraGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: space[2] },
		extraItem: { width: "50%" },
		note: { fontFamily: font.text, fontSize: size.xs, color: c.textMuted, paddingHorizontal: space[3], paddingBottom: space[3], paddingTop: space[2], borderTopWidth: 1, borderColor: c.rule },
		photo: { width: "100%", aspectRatio: 280 / 187, borderRadius: radius.sm, backgroundColor: c.surfaceSunk },
		credit: { fontFamily: font.text, fontSize: size.xs, color: c.magenta, marginTop: space[1] },
	});
