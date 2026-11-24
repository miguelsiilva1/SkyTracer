/**
 * Native (Android/iOS) map: planned for Sprint 3 (US18) with @maplibre/maplibre-react-native,
 * which needs a development build. Until then the native app shows this notice.
 */
import { StyleSheet, Text, View } from "react-native";
import { font, size, space } from "../theme";
import { useT } from "../i18n";
import { useTheme } from "../ThemeContext";
import type { LiveMapProps } from "./LiveMap.web";

export default function LiveMap(_: LiveMapProps) {
	const { c } = useTheme();
	const { t } = useT();
	return (
		<View style={[styles.box, { backgroundColor: c.bg }]}>
			<Text style={[styles.text, { color: c.textMuted }]}>{t("native.mapComing")}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	box: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", padding: space[5] },
	text: { fontFamily: font.text, fontSize: size.sm, textAlign: "center" },
});
