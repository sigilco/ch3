// ch3 canonical app — wired against the frozen createRouter contract
// (DESIGN.md §2/§7). The library core lands in ../../src/ in parallel;
// this file is ready to run the moment it does.
import { createRouter } from "../../src/index.ts";
import { MIXED_STATIC, MIXED_PARAM, MIXED_WILD } from "./common.mjs";

const app = createRouter();

app.get("/", (c) => c.text(""));
app.get("/hello", (c) => c.text("Hello World!"));
app.get("/json", (c) => c.json({ hello: "world" }));
app.get("/user/:id", (c) => c.json({ id: c.req.param("id") }));
app.post("/echo", (c) => c.text(c.req.body()), { body: true });
app.post("/user", (c) => c.text(""));
app.get("/deep/a/b/c/d/e", (c) => c.json({ ok: true }));
app.get("/files/*", (c) => c.text(c.req.param("*") || ""));

// 100-route mixed table: 60 static / 30 param / 10 wildcard.
for (const p of MIXED_STATIC) app.get(p, (c) => c.json({ ok: true }));
for (const p of MIXED_PARAM) app.get(p, (c) => c.json({ ok: true }));
for (const p of MIXED_WILD) app.get(p, (c) => c.json({ ok: true }));

app.serve({ port: Number(process.argv[2] || 3000) });
