// chttp app.fetch Web Standards compile gate:
// `scriptc coverage bench/apps/chttp-fetch.ts` must stay 100% static.
//
// Exercises the new app.fetch(req: Request) -> Promise<Response>
// surface end-to-end so a regression in the Web Standards
// lowerer shows up here before it ships. Uses a single in-process
// `new Request(...)` build (no network) so the gate runs offline
// and finishes in milliseconds; the runtime is verified by the
// router test suite, not by this gate.
//
// Also exercises the three Ctx surface additions that ship with
// app.fetch — c.set/c.get, c.req.url, c.header append — and the
// path-scoped middleware shape (app.use('*', ...)). Each is a
// separate route so a regression in any one fails the gate with
// a clear error rather than a generic compile failure.

import { createRouter } from "../../packages/router/src/index.ts";

const app = createRouter();

app.use("*", (c, next) => {
  c.header("x-power", "gate");
  next();
});

app.get("/url", (c) => {
  return c.json({ url: c.req.url, path: c.req.path });
});

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

app.get("/echo", (c) => c.text("hello from app.fetch"));

// Synthesize a Request so the scriptc coverage tool sees a real
// call to app.fetch with a Web Request in scope. The Promise is
// intentionally not awaited — scriptc treats the rejection as
// unreachable, but the call shape is what the gate checks.
const req = new Request("http://localhost/echo");
const res = app.fetch(req);
void res;

// The Node path stays available for local runs of the same
// source (pnpm --filter bench start serves on :3000). The gate
// is the static coverage check above; serve() is here so the
// file is also a runnable app for human spot-checks.
app.serve({ port: Number(process.env.PORT ?? 3000) });
