/**
 * SkyTracer HTTP server: the public entry point (REST + WebSocket).
 *
 * Every route is answered by the Tracker, which also runs the collection loop.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import { WebSocketServer } from "ws";
import type { Config } from "./config";
import type { Tracker } from "./tracker";

function corsHeaders(origin: string | null, cfg: Config): Record<string, string> {
	if (!origin || !cfg.corsOrigins.includes(origin)) return {};
	return {
		"Access-Control-Allow-Origin": origin,
		"Access-Control-Allow-Methods": "GET, OPTIONS",
		"Access-Control-Allow-Headers": "*",
		Vary: "Origin",
	};
}

/** Answers one REST request, adding CORS headers for the allowed origins. */
export async function handle(request: Request, tracker: Tracker, cfg: Config): Promise<Response> {
	const cors = corsHeaders(request.headers.get("Origin"), cfg);

	if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
	if (request.method !== "GET") return Response.json({ detail: "Method not allowed" }, { status: 405, headers: cors });

	let resp: Response;
	try {
		resp = await tracker.handle(request);
	} catch (err) {
		console.error(`${request.url} failed: ${err}`);
		resp = Response.json({ detail: "Internal error" }, { status: 500 });
	}
	const out = new Response(resp.body, resp);
	for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
	return out;
}

function toRequest(req: IncomingMessage): Request {
	const headers = new Headers();
	for (let i = 0; i < req.rawHeaders.length; i += 2) headers.append(req.rawHeaders[i]!, req.rawHeaders[i + 1]!);
	return new Request(new URL(req.url ?? "/", "http://localhost"), { method: req.method, headers });
}

/** Starts the HTTP server; WebSocket clients connect to /ws/live. */
export function startServer(tracker: Tracker, cfg: Config, port = cfg.port): Server {
	const wss = new WebSocketServer({ noServer: true });
	const server = createServer(async (req, res) => {
		const resp = await handle(toRequest(req), tracker, cfg);
		res.writeHead(resp.status, Object.fromEntries(resp.headers));
		res.end(Buffer.from(await resp.arrayBuffer()));
	});
	server.on("upgrade", (req, socket, head) => {
		if (new URL(req.url ?? "/", "http://localhost").pathname !== "/ws/live") return socket.destroy();
		wss.handleUpgrade(req, socket, head, (ws) => tracker.addClient(ws));
	});
	return server.listen(port);
}
