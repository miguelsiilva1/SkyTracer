/**
 * Gate for an external API: at most one request per `minIntervalMs`, and exponential backoff
 * (or the server's Retry-After) after 429 / 5xx / network errors.
 *
 * It never sleeps: the tracker asks `ready()` on each tick and simply tries again later, so
 * the Durable Object is never kept busy waiting.
 */

export type Fetched =
	| { kind: "ok"; data: unknown }
	| { kind: "not_found" }
	| { kind: "retry"; reason: string } // temporary failure: try again later
	| { kind: "error"; reason: string }; // permanent failure for this request

const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
const TIMEOUT_MS = 10_000;

export class ApiGate {
	private nextAllowed = 0;
	private failures = 0;

	constructor(
		private readonly userAgent: string,
		private readonly minIntervalMs = 1000,
		private readonly backoffBaseMs = 1000,
		private readonly backoffMaxMs = 60_000,
	) {}

	ready(now: number): boolean {
		return now >= this.nextAllowed;
	}

	async getJson(url: string, now: number): Promise<Fetched> {
		this.nextAllowed = now + this.minIntervalMs;
		let resp: Response;
		try {
			resp = await fetch(url, { headers: { "User-Agent": this.userAgent }, signal: AbortSignal.timeout(TIMEOUT_MS) });
		} catch (err) {
			return this.backoff(now, null, String(err));
		}
		if (resp.status === 404) {
			this.failures = 0;
			return { kind: "not_found" };
		}
		if (RETRY_STATUS.has(resp.status)) return this.backoff(now, resp, `HTTP ${resp.status}`);
		if (!resp.ok) return { kind: "error", reason: `HTTP ${resp.status}` };
		try {
			const data = await resp.json();
			this.failures = 0;
			return { kind: "ok", data };
		} catch (err) {
			return { kind: "error", reason: `invalid JSON: ${err}` };
		}
	}

	private backoff(now: number, resp: Response | null, reason: string): Fetched {
		const retryAfter = resp?.headers.get("Retry-After") ?? "";
		const delay = /^\d+$/.test(retryAfter)
			? Math.min(Number(retryAfter) * 1000, this.backoffMaxMs)
			: Math.min(this.backoffBaseMs * 2 ** this.failures, this.backoffMaxMs);
		this.failures++;
		this.nextAllowed = now + delay;
		return { kind: "retry", reason };
	}
}
