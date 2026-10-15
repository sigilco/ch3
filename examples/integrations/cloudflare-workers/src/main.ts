// Workerd entry. `app.fetch(req, env, ctx)` is the canonical
// Cloudflare Workers fetch handler signature; chttp exposes the
// same shape. The Wrangler default export wraps the request and
// hands it to the router.
import { createApp } from "./app.ts";

const app = createApp();

export default {
  async fetch(req: Request, env: unknown, ctx: unknown): Promise<Response> {
    return app.fetch(req, env, ctx);
  },
};
