// Routes module. Read by:
//   1. scriptc build of src/server.ts (which imports `app` from here).
//   2. @chttp/unplugin at buildStart, which scans the include glob
//      `**/*.chttp.ts` and emits .chttp/routes.openapi.ts +
//      .chttp/routes.client.ts from this file's registrations.
import { createRouter } from "@chttp/router";

export const app = createRouter();

app.get("/healthz", (c) => c.json({ ok: true }));
app.get("/user/:id", (c) => {
  const id = c.req.param("id");
  return c.json({ id, kind: "user" });
});
app.get("/search", (c) => {
  const q = c.req.query("q") || "";
  return c.json({ q, hits: 0 });
});
app.post("/echo", (c) => c.json({ body: c.req.body() }), { body: true });
app.delete("/user/:id", (c) => {
  const id = c.req.param("id");
  return c.json({ deleted: id });
});
app.all("/whoami", (c) => c.json({ method: c.req.method }));
