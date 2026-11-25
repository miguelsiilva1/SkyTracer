/** Settings read from the environment; everything except the Supabase credentials has a default. */
export type Env = Record<string, string | undefined>;

export interface Config {
	port: number;
	dump1090Url: string;
	networkUrl: string; // empty disables the adsb.fi network source
	networkIntervalMs: number;
	pollIntervalMs: number;
	positionMinIntervalMs: number;
	flushIntervalMs: number;
	liveExpiryMs: number;
	aircraftTtlMs: number;
	routeTtlMs: number;
	userAgent: string;
	corsOrigins: string[];
	supabaseUrl: string;
	supabaseKey: string;
}

const DAY_MS = 86_400_000;
const DUMP1090_URL = "https://ads-b.jcboliveira.xyz/dump1090/data/aircraft.json";
const NETWORK_URL = "https://opendata.adsb.fi/api/v3/lat/41.24/lon/-8.68/dist/250";
const CORS_ORIGINS = "https://miguelsiilva1.github.io,http://localhost:8081,http://localhost:19006";

function num(value: string | undefined, fallback: number): number {
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? n : fallback;
}

function required(env: Env, name: string): string {
	const value = env[name];
	if (!value) throw new Error(`${name} is not set`);
	return value;
}

export function loadConfig(env: Env = process.env): Config {
	return {
		port: num(env.PORT, 8080),
		dump1090Url: env.DUMP1090_URL || DUMP1090_URL,
		networkUrl: env.NETWORK_URL ?? NETWORK_URL,
		networkIntervalMs: num(env.NETWORK_INTERVAL_SECONDS, 10) * 1000,
		pollIntervalMs: num(env.POLL_INTERVAL_SECONDS, 3) * 1000,
		positionMinIntervalMs: num(env.POSITION_MIN_INTERVAL_SECONDS, 15) * 1000,
		flushIntervalMs: num(env.FLUSH_INTERVAL_SECONDS, 15) * 1000,
		liveExpiryMs: num(env.LIVE_EXPIRY_SECONDS, 300) * 1000,
		aircraftTtlMs: num(env.AIRCRAFT_TTL_DAYS, 30) * DAY_MS,
		routeTtlMs: num(env.ROUTE_TTL_DAYS, 7) * DAY_MS,
		userAgent: env.HTTP_USER_AGENT || "SkyTracer/0.4 (+https://github.com/miguelsiilva1/SkyTracer)",
		corsOrigins: (env.API_CORS_ORIGINS || CORS_ORIGINS).split(",").map((o) => o.trim()).filter(Boolean),
		supabaseUrl: required(env, "SUPABASE_URL").replace(/\/+$/, ""),
		supabaseKey: required(env, "SUPABASE_SECRET_KEY"),
	};
}
