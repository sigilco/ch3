import { createRouter } from "@chttp/router";
import type { Ctx } from "@chttp/router";

// The audit seam: a plain function the entry point supplies. ELF mode passes a
// file appender, node mode passes a LogTape logger. Plain strings only.
export type Audit = (level: string, message: string) => void;

export function createApp(audit: Audit) {
  const app = createRouter();

  app.use(async (c: Ctx, next) => {
    const t0 = Date.now();
    await next();
    audit("INF", c.req.method + " " + c.req.path + " " + (Date.now() - t0) + "ms");
  });

  app.get("/", (c) => c.json({ ok: true }));
  app.get("/users/:id", (c) => c.json({ id: c.req.param("id") }));
  app.post(
    "/login",
    (c: Ctx) => {
      if (c.req.body().length === 0) {
        audit("WRN", "login rejected: empty body");
        return c.status(400).json({ error: "empty body" });
      }
      audit("INF", "login accepted");
      return c.json({ ok: true });
    },
    { body: true },
  );
  return app;
}
