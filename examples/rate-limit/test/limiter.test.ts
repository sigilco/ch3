import { test } from "node:test";
import assert from "node:assert/strict";
import { Limiter, SLOTS } from "../src/limiter.ts";
import { buildApp } from "../src/app.ts";

test("allows up to the limit then reports seconds to reset", () => {
  const l = new Limiter(2, 10000);
  assert.equal(l.hit("a", 0), 0);
  assert.equal(l.hit("a", 1), 0);
  assert.equal(l.hit("a", 2000), 8);
});

test("window resets after windowMs", () => {
  const l = new Limiter(1, 1000);
  assert.equal(l.hit("a", 0), 0);
  assert.equal(l.hit("a", 500) > 0, true);
  assert.equal(l.hit("a", 1000), 0);
});

test("table stays bounded under unique keys", () => {
  const l = new Limiter(1, 1000);
  for (let i = 0; i < 10000; i++) l.hit("k" + i, 0);
  assert.equal(l.keys.length, SLOTS);
});

test("429 with Retry-After over http", async () => {
  const server = buildApp(2, 10000).serve({ port: 0 });
  await new Promise((r) => server.once("listening", r));
  const url = "http://127.0.0.1:" + (server.address() as { port: number }).port + "/";
  const h = { "x-api-key": "t" };
  assert.equal((await fetch(url, { headers: h })).status, 200);
  assert.equal((await fetch(url, { headers: h })).status, 200);
  const r = await fetch(url, { headers: h });
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get("retry-after")) > 0);
  assert.equal((await fetch(url, { headers: { "x-api-key": "other" } })).status, 200);
  server.close();
});
