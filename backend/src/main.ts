/** Starts SkyTracer: the collection loop and the HTTP/WebSocket server. */
import { loadConfig } from "./config";
import { startServer } from "./server";
import { Tracker } from "./tracker";

const cfg = loadConfig();
const tracker = new Tracker(cfg);
tracker.start();
const server = startServer(tracker, cfg);
console.log(`SkyTracer listening on port ${cfg.port}`);

async function shutdown(): Promise<void> {
	server.close();
	await tracker.stop(); // writes the history still buffered
	process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
