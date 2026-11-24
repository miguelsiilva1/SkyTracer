/** Small segmented control (radio group) used for the theme and language switches. */
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { font, type Palette, radius, size, space } from "../theme";
import { useTheme } from "../ThemeContext";

export interface Option<T extends string> {
	value: T;
	label: string;
}

export default function Segmented<T extends string>({
	label,
	options,
	value,
	onChange,
}: {
	label: string;
	options: Option<T>[];
	value: T;
	onChange: (value: T) => void;
}) {
	const { c } = useTheme();
	const s = useMemo(() => makeStyles(c), [c]);
	return (
		<View style={s.group} accessibilityRole="radiogroup" accessibilityLabel={label}>
			{options.map((o) => {
				const on = o.value === value;
				return (
					<Pressable
						key={o.value}
						onPress={() => onChange(o.value)}
						accessibilityRole="radio"
						accessibilityState={{ checked: on }}
						style={[s.option, on && s.optionOn]}
					>
						<Text style={[s.text, on && s.textOn]}>{o.label}</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

const makeStyles = (c: Palette) =>
	StyleSheet.create({
		group: { flexDirection: "row", borderWidth: 1, borderColor: c.rule, borderRadius: radius.md, padding: 2, alignSelf: "flex-start" },
		option: { paddingVertical: space[1], paddingHorizontal: space[2], borderRadius: radius.sm },
		optionOn: { backgroundColor: c.text },
		text: { fontFamily: font.text, fontSize: size.xs, color: c.textMuted },
		textOn: { color: c.surface, fontWeight: "700" },
	});
