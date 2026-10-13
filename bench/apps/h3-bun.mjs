// h3 (v2) under Bun.serve — bun cell of the h3 row.
import { H3, getRouterParam, readRawBody } from "h3";
import { MIXED_STATIC, MIXED_PARAM, MIXED_WILD } from "./common.mjs";

const app = new H3();

app.get("/", () => "");
app.get("/hello", () => "Hello World!");
app.get("/json", () => ({ hello: "world" }));
app.get("/user/:id", (e) => ({ id: getRouterParam(e, "id") }));
app.post(
  "/echo",
  async (e) => new Response(await readRawBody(e), { headers: { "content-type": "text/plain" } }),
);
app.post("/user", () => "");
app.get("/deep/a/b/c/d/e", () => ({ ok: true }));
app.get("/files/**", (e) => String(getRouterParam(e, "_") ?? ""));

for (const p of MIXED_STATIC) app.get(p, () => ({ ok: true }));
for (const p of MIXED_PARAM) app.get(p, () => ({ ok: true }));
for (const p of MIXED_WILD) app.get(p.replace(/\/\*$/, "/**"), () => ({ ok: true }));

Bun.serve({ port: 3000, fetch: (req) => app.fetch(req) });
console.log("h3+bun listening on :3000");
