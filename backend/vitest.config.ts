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
				},
			},
		}),
	],
});
