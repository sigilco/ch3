// Async handler support: handlers/middleware may return Promise<void>.
// Dispatch attaches then/catch to the tail promise; rejection routes through
// onError (or 500), and a settled-but-unsent chain falls back to 500.
import test from "node:test";
import assert from "node:assert/strict";
import { createRouter, _guard, _buffer, Ctx, ReqView } from "../dist/esm/index.js";

function fakeRes() {
  return {
    statusCode: 200,
    headersSent: false,
    headers: {},
    body: "",
    ended: false,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(s) {
      this.headersSent = true;
      if (s !== undefined) this.body = this.body + s;
      this.ended = true;
    },
    destroy() {},
  };
}

function fakeReq(method, url) {
  return { method: method, url: url, on() {} };
}

function fakeCtx(res) {
  return new Ctx(new ReqView(fakeReq("GET", "/x"), "", "/x"), res);
}

function dispatch(app, method, url) {
  const res = fakeRes();
  app._dispatch(fakeReq(method, url), res);
  return res;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

test("async handler serves the response after settling", async () => {
  const app = createRouter();
  app.get("/a", async (c) => {
    await tick();
    c.json({ ok: true });
  });
  const res = dispatch(app, "GET", "/a");
  assert.equal(res.ended, false);
  await tick();
  await tick();
  assert.equal(res.ended, true);
  assert.deepEqual(JSON.parse(res.body), { ok: true });
});

test("async middleware ordering preserved across await points", async () => {
  const app = createRouter();
  const order = [];
  app.use(async (c, next) => {
    order.push("mw1-before");
    await tick();
    await next();
    order.push("mw1-after");
  });
  app.use((c, next) => {
    order.push("mw2");
    return next();
  });
  app.get("/m", async (c) => {
    await tick();
    order.push("handler");
    c.text("done");
  });
  const res = dispatch(app, "GET", "/m");
  await tick();
  await tick();
  await tick();
  assert.equal(res.ended, true);
  assert.deepEqual(order, ["mw1-before", "mw2", "handler", "mw1-after"]);
});

test("async handler rejection routes through onError", async () => {
  const app = createRouter();
  const seen = [];
  app.onError((err, c) => {
    seen.push(String(err && err.message));
    c.status(503);
    c.text("boom");
  });
  app.get("/e", async () => {
    throw new Error("kaboom");
  });
  const res = dispatch(app, "GET", "/e");
  await tick();
  await tick();
  assert.deepEqual(seen, ["kaboom"]);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body, "boom");
});

test("async handler rejection without onError yields 500", async () => {
  const app = createRouter();
  app.get("/e", async () => {
    throw new Error("kaboom");
  });
  const res = dispatch(app, "GET", "/e");
  await tick();
  await tick();
  assert.equal(res.statusCode, 500);
});

test("async handler that settles without responding gets 500 fallback", async () => {
  const app = createRouter();
  app.get("/s", async () => {
    await tick();
  });
  const res = dispatch(app, "GET", "/s");
  await tick();
  await tick();
  await tick();
  assert.equal(res.statusCode, 500);
});

test("sync handler that never responds still gets 500 fallback", () => {
  const app = createRouter();
  app.get("/s", () => {
    // intentionally no response
  });
  const res = dispatch(app, "GET", "/s");
  assert.equal(res.statusCode, 500);
});

test("async handler on a body route", async () => {
  const app = createRouter();
  const bodies = [];
  app.post(
    "/echo",
    async (c) => {
      await tick();
      bodies.push(c.req.body());
      c.text("acked:" + String(c.req.body().length));
    },
    { body: true },
  );
  const res = fakeRes();
  let endCb = null;
  const req = {
    method: "POST",
    url: "/echo",
    on(ev, cb) {
      if (ev === "data") cb(Buffer.from("hello"));
      if (ev === "end") endCb = cb;
    },
  };
  app._dispatch(req, res);
  endCb();
  await tick();
  await tick();
  assert.deepEqual(bodies, ["hello"]);
  assert.equal(res.body, "acked:5");
});

test("mixed sync and async routes coexist", async () => {
  const app = createRouter();
  app.get("/sync", (c) => c.text("s"));
  app.get("/async", async (c) => {
    await tick();
    c.text("a");
  });
  const r1 = dispatch(app, "GET", "/sync");
  assert.equal(r1.body, "s");
  const r2 = dispatch(app, "GET", "/async");
  await tick();
  await tick();
  assert.equal(r2.body, "a");
});

// Contract helpers (docs/route-contract.md) — generated dispatch routes
// run through _guard/_buffer, which must settle thenable chain results
// the same way internal dispatch does.

test("_guard lets an async k write the response after settling", async () => {
  const res = fakeRes();
  _guard(res, fakeCtx(res), async () => {
    await tick();
    res.setHeader("content-type", "text/plain");
    res.end("gen-ok");
  });
  await tick();
  await tick();
  assert.equal(res.body, "gen-ok");
  assert.equal(res.statusCode, 200);
});

test("_guard answers 500 when the async k rejects", async () => {
  const res = fakeRes();
  _guard(res, fakeCtx(res), async () => {
    await tick();
    throw new Error("gen-boom");
  });
  await tick();
  await tick();
  assert.equal(res.statusCode, 500);
});

test("_guard answers 500 when the chain settles without a response", async () => {
  const res = fakeRes();
  _guard(res, fakeCtx(res), async () => {
    await tick();
  });
  await tick();
  await tick();
  await tick();
  assert.equal(res.statusCode, 500);
});

test("_guard answers 500 when a sync k never responds", () => {
  const res = fakeRes();
  _guard(res, fakeCtx(res), () => {
    // intentionally no response
  });
  assert.equal(res.statusCode, 500);
});

test("_buffer stores the body then runs an async k under the guard", async () => {
  const res = fakeRes();
  let endCb = null;
  const req = {
    on(ev, cb) {
      if (ev === "data") cb(Buffer.from("hello"));
      if (ev === "end") endCb = cb;
    },
  };
  const c = new Ctx(new ReqView(req, "", "/echo"), res);
  const seen = [];
  _buffer(req, res, c, async () => {
    await tick();
    seen.push(c.req.body());
    c.text("buf-ok");
  });
  endCb();
  await tick();
  await tick();
  await tick();
  assert.deepEqual(seen, ["hello"]);
  assert.equal(res.body, "buf-ok");
});
