/**
 * SkyTracer Worker: the public entry point (REST + WebSocket).
 *
 * Every route is answered by the single Tracker Durable Object, which also runs the
 * collection loop (any request, such as GET /health, starts it after a deploy).
 */
import { loadConfig } from "./config";

export { Tracker } from "./tracker";

const TRACKER_NAME = "porto";

function corsHeaders(request: Request, env: Env): Record<string, string> {
	const origin = request.headers.get("Origin");
	if (!origin || !loadConfig(env).corsOrigins.includes(origin)) return {};
	return {
		"Access-Control-Allow-Origin": origin,
		"Access-Control-Allow-Methods": "GET, OPTIONS",
		"Access-Control-Allow-Headers": "*",
		Vary: "Origin",
	};
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const cors = corsHeaders(request, env);

		if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
		if (request.method !== "GET") return Response.json({ detail: "Method not allowed" }, { status: 405, headers: cors });

		const resp = await env.TRACKER.getByName(TRACKER_NAME).fetch(request);
		if (resp.webSocket) return resp;
		const out = new Response(resp.body, resp);
		for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
		return out;
	},
} satisfies ExportedHandler<Env>;
