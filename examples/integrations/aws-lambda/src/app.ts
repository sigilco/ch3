// The chttp app. Identical shape to a node:http deployment;
// only the bridge in src/handler.ts changes between targets.
import { createRouter } from "@chttp/router";

export function createApp() {
  const app = createRouter();

  app.get("/", (c) => c.text("hello from chttp on AWS Lambda"));

  app.get("/user/:id", (c) => {
    return c.json({ id: c.req.param("id"), source: "aws-lambda" });
  });

  app.post("/echo", (c) => c.text("got: " + c.req.body()), { body: true });

  return app;
}
