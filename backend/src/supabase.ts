/** Minimal Supabase (PostgREST) client: only what the tracker needs. */

export class SupabaseError extends Error {}

export class Supabase {
	constructor(
		private readonly url: string,
		private readonly key: string,
	) {}

	private async request(path: string, init: RequestInit = {}): Promise<unknown> {
		const resp = await fetch(`${this.url}/rest/v1/${path}`, {
			...init,
			headers: { apikey: this.key, "Content-Type": "application/json", ...init.headers },
		});
		if (!resp.ok) throw new SupabaseError(`${init.method ?? "GET"} ${path.split("?")[0]}: HTTP ${resp.status} ${await resp.text()}`);
		const text = await resp.text();
		return text ? JSON.parse(text) : null;
	}

	/** GET /rest/v1/<table>?<query> */
	async select<T>(table: string, query: string): Promise<T[]> {
		return (await this.request(`${table}?${query}`)) as T[];
	}

	/**
	 * Every row of a query, page by page: the Data API returns at most 1000 rows per request.
	 * `maxRows` bounds the total, so one call cannot read an unbounded amount.
	 */
	async selectAll<T>(table: string, query: string, maxRows = 20_000, page = 1000): Promise<T[]> {
		const rows: T[] = [];
		for (let offset = 0; offset < maxRows; offset += page) {
			const batch = await this.select<T>(table, `${query}&limit=${page}&offset=${offset}`);
			rows.push(...batch);
			if (batch.length < page) break;
		}
		return rows;
	}

	/** POST /rest/v1/rpc/<fn> */
	async rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
		return this.request(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
	}
}

/** Quotes a value for a PostgREST `in.(...)` filter. */
export function inList(values: Iterable<string>): string {
	return `(${[...values].map((v) => `"${v.replace(/["\\]/g, "")}"`).join(",")})`;
}
