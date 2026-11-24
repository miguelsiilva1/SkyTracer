import { altitudeStops, groundColor } from "./theme";

function mix(a: string, b: string, t: number): string {
	const ca = parseInt(a.slice(1), 16);
	const cb = parseInt(b.slice(1), 16);
	const channel = (shift: number) =>
		Math.round(((ca >> shift) & 255) + (((cb >> shift) & 255) - ((ca >> shift) & 255)) * t);
	return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, "0")}`;
}

/** Colour of an altitude on the shared scale; grey on the ground or when unknown. */
export function altitudeColor(altitudeFt: number | null, onGround = false): string {
	if (onGround || altitudeFt === null) return groundColor;
	const first = altitudeStops[0]!;
	const last = altitudeStops[altitudeStops.length - 1]!;
	if (altitudeFt <= first[0]) return first[1];
	if (altitudeFt >= last[0]) return last[1];
	for (let i = 1; i < altitudeStops.length; i++) {
		const [hi, cHi] = altitudeStops[i]!;
		const [lo, cLo] = altitudeStops[i - 1]!;
		if (altitudeFt <= hi) return mix(cLo, cHi, (altitudeFt - lo) / (hi - lo));
	}
	return last[1];
}
