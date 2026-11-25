/**
 * Live map for the web (maplibre-gl). Aircraft are drawn as icons rotated by their track and
 * coloured by altitude (US06); the selected aircraft gets a ring and its track (US10). The base
 * map follows the day / night theme.
 */
import type { Feature, FeatureCollection } from "geojson";
import {
	type GeoJSONSource,
	Map as MapLibre,
	type MapLayerMouseEvent,
	type MapMouseEvent,
	NavigationControl,
	setWorkerUrl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { altitudeColor } from "../altitude";
import { MAP_CENTER, MAP_ZOOM } from "../config";
import { mapStyles, type Palette, type ThemeName, tintMap } from "../theme";
import { useTheme } from "../ThemeContext";
import type { LiveAircraft, TrackPoint } from "../types";

// worker copied to public/ by scripts/copy-maplibre-worker.mjs
setWorkerUrl(`${process.env.EXPO_BASE_URL ?? ""}/maplibre-gl-worker.mjs`);

export interface LiveMapProps {
	aircraft: LiveAircraft[];
	selectedHex: string | null;
	track: TrackPoint[];
	onSelect: (hex: string | null) => void;
}

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * Aircraft silhouette pointing north, used as an SDF icon so it can be tinted per altitude:
 * filled for the course receiver, outlined for aircraft seen only by the adsb.fi network.
 */
function planeIcon(outline = false): ImageData {
	const s = 48;
	const ctx = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
	ctx.canvas.width = ctx.canvas.height = s;
	ctx.fillStyle = "#fff";
	ctx.beginPath();
	// fuselage, swept wings and tailplane
	const shape: [number, number][] = [
		[24, 3], [26.5, 8], [26.5, 19], [44, 30], [44, 33.5], [26.5, 27.5], [26.5, 37], [32, 41.5],
		[32, 44.5], [24, 42], [16, 44.5], [16, 41.5], [21.5, 37], [21.5, 27.5], [4, 33.5], [4, 30],
		[21.5, 19], [21.5, 8],
	];
	shape.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
	ctx.closePath();
	if (outline) {
		ctx.strokeStyle = "#fff";
		ctx.lineWidth = 3;
		ctx.lineJoin = "round";
		ctx.stroke();
	} else ctx.fill();
	return ctx.getImageData(0, 0, s, s);
}

function aircraftFeatures(list: LiveAircraft[]): FeatureCollection {
	return {
		type: "FeatureCollection",
		features: list.map((a) => ({
			type: "Feature",
			geometry: { type: "Point", coordinates: [a.lon, a.lat] },
			properties: {
				hex: a.hex,
				source: a.source,
				priority: a.source === "receiver" ? 1 : 0,
				label: a.callsign ?? a.registration ?? a.hex.toUpperCase(),
				track: a.track_deg ?? 0,
				color: altitudeColor(a.altitude_ft, a.on_ground),
			},
		})),
	};
}

/** One segment per pair of points, so each can carry the colour of its altitude. */
function trackFeatures(points: TrackPoint[], live: LiveAircraft | undefined): FeatureCollection {
	const all = live
		? [...points, { lat: live.lat, lon: live.lon, altitude_ft: live.altitude_ft, on_ground: live.on_ground }]
		: points;
	const features: Feature[] = [];
	for (let i = 1; i < all.length; i++) {
		const a = all[i - 1]!;
		const b = all[i]!;
		features.push({
			type: "Feature",
			geometry: { type: "LineString", coordinates: [[a.lon, a.lat], [b.lon, b.lat]] },
			properties: { color: altitudeColor(b.altitude_ft, b.on_ground) },
		});
	}
	return { type: "FeatureCollection", features };
}

/** Tints the base map's land and water with the theme, so map and panels read as one surface. */
function tintBaseMap(m: MapLibre, c: Palette) {
	for (const layer of m.getStyle().layers) {
		if (layer.type === "background") m.setPaintProperty(layer.id, "background-color", c.bg);
		else if (layer.type === "fill" && layer.id.startsWith("water")) m.setPaintProperty(layer.id, "fill-color", c.surfaceSunk);
	}
}

/** Icon, sources and layers on top of the base map; added again after every style change. */
function addOverlay(m: MapLibre, c: Palette, theme: ThemeName) {
	if (tintMap[theme]) tintBaseMap(m, c);
	if (!m.hasImage("plane")) m.addImage("plane", planeIcon(), { sdf: true });
	if (!m.hasImage("plane-outline")) m.addImage("plane-outline", planeIcon(true), { sdf: true });
	m.addSource("track", { type: "geojson", data: EMPTY });
	m.addSource("aircraft", { type: "geojson", data: EMPTY });
	m.addLayer({
		id: "track",
		type: "line",
		source: "track",
		layout: { "line-cap": "round", "line-join": "round" },
		paint: { "line-color": ["get", "color"], "line-width": 3 },
	});
	m.addLayer({
		id: "selected",
		type: "circle",
		source: "aircraft",
		filter: ["==", ["get", "hex"], ""],
		paint: {
			"circle-radius": 16,
			"circle-color": "transparent",
			"circle-stroke-color": c.selection,
			"circle-stroke-width": 1.5,
		},
	});
	m.addLayer({
		id: "aircraft",
		type: "symbol",
		source: "aircraft",
		layout: {
			"icon-image": ["match", ["get", "source"], "receiver", "plane", "plane-outline"],
			"icon-size": 0.55,
			"icon-rotate": ["get", "track"],
			"icon-rotation-alignment": "map",
			// the course receiver's aircraft are drawn on top, and their labels win placement
			"symbol-sort-key": ["-", 1, ["get", "priority"]],
			"icon-allow-overlap": true,
			"icon-ignore-placement": true,
			"text-field": ["step", ["zoom"], "", 8, ["get", "label"]],
			"text-font": ["Noto Sans Regular"],
			"text-size": 11,
			"text-offset": [0, 1.6],
			"text-anchor": "top",
			"text-optional": true,
		},
		paint: {
			"icon-color": ["get", "color"],
			"icon-halo-color": c.bg,
			"icon-halo-width": 1,
			"text-color": c.text,
			"text-halo-color": c.bg,
			"text-halo-width": 1.5,
		},
	});
}

export default function LiveMap({ aircraft, selectedHex, track, onSelect }: LiveMapProps) {
	const { name, c } = useTheme();
	const container = useRef<HTMLDivElement>(null);
	const map = useRef<MapLibre | null>(null);
	const palette = useRef(c);
	palette.current = c;
	const select = useRef(onSelect);
	select.current = onSelect;
	const styleName = useRef(name);
	// incremented each time the overlay is (re)created, so the data is applied again
	const [overlay, setOverlay] = useState(0);

	useEffect(() => {
		const m = new MapLibre({
			container: container.current as HTMLDivElement,
			style: mapStyles[styleName.current],
			center: MAP_CENTER,
			zoom: MAP_ZOOM,
			attributionControl: {
				compact: true,
				customAttribution: "Aircraft: STAER receiver (Porto)",
			},
		});
		m.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
		m.on("style.load", () => {
			addOverlay(m, palette.current, styleName.current);
			setOverlay((n) => n + 1);
		});
		m.on("click", "aircraft", (e: MapLayerMouseEvent) => {
			const hex = e.features?.[0]?.properties?.hex;
			if (hex) select.current(String(hex));
		});
		m.on("click", (e: MapMouseEvent) => {
			if (!m.getLayer("aircraft")) return;
			if (!m.queryRenderedFeatures(e.point, { layers: ["aircraft"] }).length) select.current(null);
		});
		m.on("mouseenter", "aircraft", () => (m.getCanvas().style.cursor = "pointer"));
		m.on("mouseleave", "aircraft", () => (m.getCanvas().style.cursor = ""));
		map.current = m;
		return () => m.remove();
	}, []);

	useEffect(() => {
		const m = map.current;
		if (!m || styleName.current === name) return;
		styleName.current = name;
		m.setStyle(mapStyles[name]);
	}, [name]);

	useEffect(() => {
		const m = map.current;
		if (!m || !overlay || !m.getSource("aircraft")) return;
		(m.getSource("aircraft") as GeoJSONSource).setData(aircraftFeatures(aircraft));
		m.setFilter("selected", ["==", ["get", "hex"], selectedHex ?? ""]);
		const live = aircraft.find((a) => a.hex === selectedHex);
		(m.getSource("track") as GeoJSONSource).setData(selectedHex ? trackFeatures(track, live) : EMPTY);
	}, [overlay, aircraft, selectedHex, track]);

	return <div ref={container} style={{ position: "absolute", inset: 0, background: c.bg }} />;
}
