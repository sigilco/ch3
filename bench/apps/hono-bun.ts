// hono under Bun.serve — bun cell of the hono row.
import { Hono } from "hono";
import { MIXED_STATIC, MIXED_PARAM, MIXED_WILD } from "./common.mjs";

const app = new Hono();

app.get("/", (c) => c.text(""));
app.get("/hello", (c) => c.text("Hello World!"));
app.get("/json", (c) => c.json({ hello: "world" }));
app.get("/user/:id", (c) => c.json({ id: c.req.param("id") }));
app.post("/echo", async (c) => c.text(await c.req.text()));
app.post("/user", (c) => c.text(""));
app.get("/deep/a/b/c/d/e", (c) => c.json({ ok: true }));
app.get("/files/:splat{.+}", (c) => c.text(c.req.param("splat")));

for (const p of MIXED_STATIC) app.get(p, (c) => c.json({ ok: true }));
for (const p of MIXED_PARAM) app.get(p, (c) => c.json({ ok: true }));
for (const p of MIXED_WILD) app.get(p.replace(/\/\*$/, "/:splat{.+}"), (c) => c.json({ ok: true }));

export default { port: 3000, fetch: app.fetch };
