export interface Config {
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

function num(value: string | undefined, fallback: number): number {
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadConfig(env: Env): Config {
	return {
		dump1090Url: env.DUMP1090_URL,
		networkUrl: env.NETWORK_URL ?? "",
		networkIntervalMs: num(env.NETWORK_INTERVAL_SECONDS, 10) * 1000,
		pollIntervalMs: num(env.POLL_INTERVAL_SECONDS, 3) * 1000,
		positionMinIntervalMs: num(env.POSITION_MIN_INTERVAL_SECONDS, 15) * 1000,
		flushIntervalMs: num(env.FLUSH_INTERVAL_SECONDS, 15) * 1000,
		liveExpiryMs: num(env.LIVE_EXPIRY_SECONDS, 300) * 1000,
		aircraftTtlMs: num(env.AIRCRAFT_TTL_DAYS, 30) * DAY_MS,
		routeTtlMs: num(env.ROUTE_TTL_DAYS, 7) * DAY_MS,
		userAgent: env.HTTP_USER_AGENT || "SkyTracer/0.3 (+https://github.com/miguelsiilva1/SkyTracer)",
		corsOrigins: env.API_CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
		supabaseUrl: env.SUPABASE_URL.replace(/\/+$/, ""),
		supabaseKey: env.SUPABASE_SECRET_KEY,
	};
}
