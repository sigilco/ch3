// Spike: app.fetch-shaped dispatch in a scriptc ELF without WHATWG
// Request construction. `new Request` is unconstructable under scriptc
// ("expected object at $, got Request"), so this app exercises the
// fetch dispatch path a host shim would use: Node server in,
// _dispatchPrim + FetchResponseSink + toResponse() out.
//
// Throwaway spike — signal over polish. No autocannon, no bench cells.

import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRouter, FetchResponseSink } from "../../packages/router/src/index.ts";

const app = createRouter();

app.use("*", (c, next) => {
  c.header("x-power", "gate");
  next();
});

app.get("/json", (c) => c.json({ hello: "world" }));
app.get("/user/:id", (c) => c.json({ id: c.req.param("id") }));
app.get("/vars", (c) => {
  c.set("user", { id: 1, name: "ada" });
  const u = c.get<{ id: number; name: string }>("user");
  return c.json({ user: u });
});
app.get("/cookies", (c) => {
  c.header("set-cookie", "a=1", { append: true });
  c.header("set-cookie", "b=2", { append: true });
  return c.text("ok");
});
app.post("/echo", (c) => c.text(c.req.body()));

const srv = createServer(function (req: IncomingMessage, res: ServerResponse): void {
  const method = String(req.method || "GET");
  const url = String(req.url || "/");
  const body = "";
  const sink = new FetchResponseSink();
  const p = app._dispatchPrim(method, url, null, body, sink);
  p.then(function (): void {
    const out = sink.toResponse();
    res.statusCode = out.status;
    const hs = sink.hdrList;
    for (let i = 0; i + 1 < hs.length; i += 2) {
      res.setHeader(String(hs[i]), String(hs[i + 1]));
    }
    out.text().then(function (t: string): void {
      res.end(t);
    });
  });
});

srv.listen(3000, function (): void {
  console.log("fetch-surface listening :3000");
});
