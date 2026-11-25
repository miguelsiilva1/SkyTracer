/**
 * Design tokens. The look borrows from aeronautical charts (chart paper, aeronautical blue,
 * chart magenta) and from ATC flight progress strips; text uses B612, the typeface Airbus
 * designed for cockpit displays.
 */

/** light: chart paper; dark: instrument panel; standard: a regular street map with the light panels. */
export type ThemeName = "light" | "dark" | "standard";

export interface Palette {
	bg: string;
	surface: string;
	surfaceSunk: string;
	rule: string; // hairlines between strip boxes
	text: string;
	textMuted: string;
	blue: string; // live status, interactive elements
	magenta: string; // route line, links (chart magenta)
	danger: string; // emergency squawks
	warning: string; // reconnecting
	selection: string; // ring around the selected aircraft
}

const light: Palette = {
	bg: "#E9EDEA",
	surface: "#F6F8F6",
	surfaceSunk: "#E1E6E2",
	rule: "#C3CCC6",
	text: "#18242F",
	textMuted: "#55636F",
	blue: "#1E5C99",
	magenta: "#A8246F",
	danger: "#C0283A",
	warning: "#9A6A00",
	selection: "#18242F",
};

const dark: Palette = {
	bg: "#172532",
	surface: "#1D2E3D",
	surfaceSunk: "#16232F",
	rule: "#2F4456",
	text: "#E4EAEF",
	textMuted: "#9AABBA",
	blue: "#79AEE0",
	magenta: "#E06BAE",
	danger: "#F0646F",
	warning: "#E3B341",
	selection: "#FFFFFF",
};

export const palettes: Record<ThemeName, Palette> = { light, dark, standard: light };

/**
 * Base maps from VersaTiles (free OpenStreetMap vector tiles, no key). OpenFreeMap was replaced
 * because common ad blockers block its tile addresses, which left the map without a background.
 */
const VERSATILES = "https://tiles.versatiles.org/assets/styles";
export const mapStyles: Record<ThemeName, string> = {
	light: `${VERSATILES}/graybeard/style.json`,
	dark: `${VERSATILES}/eclipse/style.json`,
	standard: `${VERSATILES}/colorful/style.json`,
};

/** Whether the base map is tinted with the theme colours (the standard map keeps its own). */
export const tintMap: Record<ThemeName, boolean> = { light: true, dark: true, standard: false };

/** Altitude scale (feet) shared by the aircraft icons, the track and the legend; legible on every theme. */
export const altitudeStops: readonly [number, string][] = [
	[0, "#2F9C8F"],
	[10_000, "#5C9A35"],
	[20_000, "#C2921A"],
	[30_000, "#D2602A"],
	[40_000, "#B23A48"],
];
export const groundColor = "#7A8691";

export const font = {
	text: "B612, 'Segoe UI', system-ui, sans-serif",
	code: "'B612 Mono', ui-monospace, monospace", // callsigns, squawks, ICAO and IATA codes only
} as const;

export const size = { xs: 12, sm: 14, md: 16, lg: 20, xl: 26, xxl: 34 } as const;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32 } as const;

export const radius = { sm: 2, md: 6 } as const;
