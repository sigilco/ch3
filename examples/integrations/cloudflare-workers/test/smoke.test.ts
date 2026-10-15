// Local smoke test — boots the router in-process (no Workerd
// needed) and exercises the same routes a deployed worker
// would serve. The `wrangler dev` integration is documented in
// the README; this test is the always-on gate that catches
// regressions before `wrangler deploy`.
import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.ts";

test("GET / returns the landing string", async () => {
  const app = createApp();
  const res = await app.fetch(new Request("http://localhost/"));
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "hello from chttp on Cloudflare Workers");
});

test("GET /user/:id returns the id in JSON", async () => {
  const app = createApp();
  const res = await app.fetch(new Request("http://localhost/user/42"));
  assert.equal(res.status, 200);
  const body = (await res.json()) as { id: string; source: string };
  assert.equal(body.id, "42");
  assert.equal(body.source, "cloudflare-workers");
});

test("POST /echo returns the buffered body", async () => {
  const app = createApp();
  const res = await app.fetch(
    new Request("http://localhost/echo", {
      method: "POST",
      body: "ping",
    }),
  );
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "got: ping");
});
