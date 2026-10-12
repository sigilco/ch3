// ch3 compiled-mode bench app — canonical routes + a hand-written
// generated dispatch module (what the Vite/unplugin transform will emit,
// per docs/route-contract.md). The same handler functions back both the
// registered table and the generated matcher.
import { createRouter, GenDispatch, ReqView, Ctx, dec, _guard, _buffer } from "../../src/index.ts";
import type { IncomingMessage, ServerResponse } from "node:http";
import { MIXED_STATIC, MIXED_PARAM, MIXED_WILD } from "./common.mjs";

const okJson = (c: Ctx): void => {
  c.json({ ok: true });
};

class CompiledRoutes extends GenDispatch {
  dispatch(req: IncomingMessage, res: ServerResponse): boolean {
    const url: string = String(req.url || "/");
    let path = url;
    let qs = "";
    const qi = url.indexOf("?");
    if (qi >= 0) {
      path = String(url.slice(0, qi));
      qs = String(url.slice(qi + 1));
    }
    const method: string = String(req.method || "");
    const rv = new ReqView(req, qs, path);
    const c = new Ctx(rv, res);
    if (method === "GET" || method === "HEAD") {
      if (path === "/") {
        _guard(res, function (): void {
          c.text("");
        });
        return true;
      }
      if (path === "/hello") {
        _guard(res, function (): void {
          c.text("Hello World!");
        });
        return true;
      }
      if (path === "/json") {
        _guard(res, function (): void {
          c.json({ hello: "world" });
        });
        return true;
      }
      if (path === "/deep/a/b/c/d/e") {
        _guard(res, function (): void {
          okJson(c);
        });
        return true;
      }
      if (path.indexOf("/user/") === 0) {
        rv._seedPm(["id", dec(path.slice(6))]);
        _guard(res, function (): void {
          c.json({ id: c.req.param("id") });
        });
        return true;
      }
      if (path.indexOf("/files/") === 0) {
        rv._seedPm(["*", dec(path.slice(7))]);
        _guard(res, function (): void {
          c.text(c.req.param("*") || "");
        });
        return true;
      }
      // mixed table: '/m/s<i>/detail' statics, '/m/p<i>/<v>' params,
      // '/m/w<i>/<rest>' wildcards.
      if (path.indexOf("/m/s") === 0 && path.indexOf("/detail") > 4) {
        _guard(res, function (): void {
          okJson(c);
        });
        return true;
      }
      if (path.indexOf("/m/p") === 0) {
        const rest = path.slice(4);
        const slash = rest.indexOf("/");
        if (slash > 0) {
          rv._seedPm(["id", dec(rest.slice(slash + 1))]);
          _guard(res, function (): void {
            okJson(c);
          });
          return true;
        }
      }
      if (path.indexOf("/m/w") === 0) {
        const rest = path.slice(4);
        const slash = rest.indexOf("/");
        if (slash > 0) {
          rv._seedPm(["*", dec(rest.slice(slash + 1))]);
          _guard(res, function (): void {
            okJson(c);
          });
          return true;
        }
      }
      return false;
    }
    if (method === "POST" && path === "/echo") {
      _buffer(req, res, c, function (): void {
        c.text(c.req.body());
      });
      return true;
    }
    if (method === "POST" && path === "/user") {
      _guard(res, function (): void {
        c.text("");
      });
      return true;
    }
    return false;
  }
}

const app = createRouter();
app.withDispatch(new CompiledRoutes());

app.get("/", (c) => c.text(""));
app.get("/hello", (c) => c.text("Hello World!"));
app.get("/json", (c) => c.json({ hello: "world" }));
app.get("/user/:id", (c) => c.json({ id: c.req.param("id") }));
app.post("/echo", (c) => c.text(c.req.body()), { body: true });
app.post("/user", (c) => c.text(""));
app.get("/deep/a/b/c/d/e", (c) => c.json({ ok: true }));
app.get("/files/*", (c) => c.text(c.req.param("*") || ""));

for (const p of MIXED_STATIC) app.get(p, (c) => c.json({ ok: true }));
for (const p of MIXED_PARAM) app.get(p, (c) => c.json({ ok: true }));
for (const p of MIXED_WILD) app.get(p, (c) => c.json({ ok: true }));

app.serve({ port: 3000 });
