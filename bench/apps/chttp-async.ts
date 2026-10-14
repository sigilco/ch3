// chttp async canonical app — identical route table to chttp.ts, but every
// handler is `async`, so each request exercises the thenable settle path
// (microtask scheduling + then/catch attach) under node, bun, and the
// scriptc ELF build.
import { createRouter } from "../../packages/router/src/index.ts";
import { MIXED_STATIC, MIXED_PARAM, MIXED_WILD } from "./common.mjs";

const app = createRouter();

app.get("/", async (c) => c.text(""));
app.get("/hello", async (c) => c.text("Hello World!"));
app.get("/json", async (c) => c.json({ hello: "world" }));
app.get("/user/:id", async (c) => c.json({ id: c.req.param("id") }));
app.post("/echo", async (c) => c.text(c.req.body()), { body: true });
app.post("/user", async (c) => c.text(""));
app.get("/deep/a/b/c/d/e", async (c) => c.json({ ok: true }));
app.get("/files/*", async (c) => c.text(c.req.param("*") || ""));

// 100-route mixed table: 60 static / 30 param / 10 wildcard.
for (const p of MIXED_STATIC) app.get(p, async (c) => c.json({ ok: true }));
for (const p of MIXED_PARAM) app.get(p, async (c) => c.json({ ok: true }));
for (const p of MIXED_WILD) app.get(p, async (c) => c.json({ ok: true }));

app.serve({ port: Number(process.argv[2] || 3000) });
