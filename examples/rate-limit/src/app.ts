import { createRouter } from "@chttp/router";
import { Limiter } from "./limiter.ts";

// 5 requests per 10 seconds per client. Behind a proxy, key on the header it
// sets (x-forwarded-for); a direct client can send x-api-key instead.
export function buildApp(limit: number, windowMs: number) {
  const app = createRouter();
  const limiter = new Limiter(limit, windowMs);

  app.use(async (c, next) => {
    let key = c.req.header("x-api-key");
    if (key === null) {
      key = c.req.header("x-forwarded-for");
    }
    if (key === null) {
      key = "anon";
    }
    const retry = limiter.hit(key, Date.now());
    c.header("RateLimit-Limit", "" + limit);
    c.header("RateLimit-Remaining", "" + limiter.remaining(key));
    if (retry > 0) {
      c.header("Retry-After", "" + retry);
      c.status(429).json({ error: "rate limited", retryAfter: retry });
      return;
    }
    await next();
  });

  app.get("/", (c) => c.text("ok"));
  return app;
}
