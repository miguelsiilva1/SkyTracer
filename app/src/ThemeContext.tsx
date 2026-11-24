import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import { type Palette, palettes, type ThemeName } from "./theme";

const STORAGE_KEY = "skytracer.theme";

interface ThemeValue {
	name: ThemeName;
	c: Palette;
	setTheme: (name: ThemeName) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

const THEMES: ThemeName[] = ["light", "dark", "standard"];

function initialTheme(): ThemeName {
	if (Platform.OS !== "web") return "dark";
	try {
		const saved = window.localStorage.getItem(STORAGE_KEY) as ThemeName | null;
		if (saved && THEMES.includes(saved)) return saved;
	} catch {
		// storage unavailable: fall back to the system preference
	}
	return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Light, dark or standard map theme, remembered on the device. */
export function ThemeProvider({ children }: { children: ReactNode }) {
	const [name, setTheme] = useState<ThemeName>(initialTheme);

	useEffect(() => {
		if (Platform.OS !== "web") return;
		try {
			window.localStorage.setItem(STORAGE_KEY, name);
		} catch {
			// not persisted; the choice still applies to this visit
		}
		document.documentElement.style.colorScheme = name === "dark" ? "dark" : "light";
	}, [name]);

	const value = useMemo(() => ({ name, c: palettes[name], setTheme }), [name]);
	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
	const value = useContext(ThemeContext);
	if (!value) throw new Error("useTheme outside ThemeProvider");
	return value;
}
