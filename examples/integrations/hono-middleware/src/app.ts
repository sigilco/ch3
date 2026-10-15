import { createRouter } from "@chttp/router";
import { logger } from "hono/logger";

// `hono/logger` is wired in unmodified. It calls `c.req.method`,
// `c.req.url`, and `c.res.status` (see hono/logger source). This file
// does NOT patch the middleware; if chttp's Ctx surface is missing
// anything Hono needs, that is reported back, not papered over here.
export function createApp() {
  const app = createRouter();
  app.use("*", logger());
  app.get("/", (c) => c.text("ok"));
  app.get("/users/:id", (c) => c.json({ id: c.req.param("id") }));
  return app;
}