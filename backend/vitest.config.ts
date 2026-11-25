import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: "./wrangler.jsonc" },
			miniflare: {
				bindings: {
					SUPABASE_URL: "https://supabase.test",
					SUPABASE_SECRET_KEY: "test-key",
					HTTP_USER_AGENT: "SkyTracer/test",
					// the network source is disabled in production but stays covered by the tests
					NETWORK_URL: "https://opendata.adsb.fi/api/v3/lat/41.24/lon/-8.68/dist/250",
				},
			},
		}),
	],
});
