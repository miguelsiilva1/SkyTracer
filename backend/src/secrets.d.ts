// Secrets: set with `wrangler secret put` (and `.dev.vars` locally), so they are not in
// wrangler.jsonc and `wrangler types` does not see them.
interface Secrets {
	SUPABASE_URL: string;
	SUPABASE_SECRET_KEY: string;
	HTTP_USER_AGENT?: string;
}
interface Env extends Secrets {}
declare namespace Cloudflare {
	interface Env extends Secrets {}
}
