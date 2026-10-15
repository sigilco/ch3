// The chttp app. Identical shape to a node:http deployment;
// only the entry point (src/main.ts) changes between targets.
import { createRouter } from "@chttp/router";

export function createApp() {
  const app = createRouter();

  app.get("/", (c) => c.text("hello from chttp on Cloudflare Workers"));

  app.get("/user/:id", (c) => {
    return c.json({ id: c.req.param("id"), source: "cloudflare-workers" });
  });

  app.post("/echo", (c) => c.text("got: " + c.req.body()), { body: true });

  return app;
}
