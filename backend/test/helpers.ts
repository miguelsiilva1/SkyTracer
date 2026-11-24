import { vi } from "vitest";

export type Handler = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>;

/** Replaces the global fetch; returns the list of requested URLs. */
export function mockFetch(handler: Handler): URL[] {
	const seen: URL[] = [];
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
		const url = new URL(input instanceof Request ? input.url : String(input));
		seen.push(url);
		return handler(url, init);
	});
	return seen;
}
