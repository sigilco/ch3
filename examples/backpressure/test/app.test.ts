import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.ts";

async function start(max: number, body: number, slow: number) {
  const server = buildApp(max, body, slow).serve({ port: 0 });
  await new Promise((r) => server.once("listening", r));
  return { server, url: "http://127.0.0.1:" + (server.address() as { port: number }).port };
}

test("sheds load past the in-flight cap with 503 + Retry-After", async () => {
  const { server, url } = await start(2, 1024, 200);
  const rs = await Promise.all([1, 2, 3, 4].map(() => fetch(url + "/slow")));
  const codes = rs.map((r) => r.status).sort();
  assert.deepEqual(codes, [200, 200, 503, 503]);
  const shed = rs.find((r) => r.status === 503)!;
  assert.equal(shed.headers.get("retry-after"), "1");
  server.close();
});

test("capacity frees up after requests finish", async () => {
  const { server, url } = await start(1, 1024, 50);
  assert.equal((await fetch(url + "/slow")).status, 200);
  assert.equal((await fetch(url + "/slow")).status, 200);
  server.close();
});

test("rejects oversize bodies with 413", async () => {
  const { server, url } = await start(2, 10, 10);
  const r = await fetch(url + "/echo", { method: "POST", body: "x".repeat(100) });
  assert.equal(r.status, 413);
  const ok = await fetch(url + "/echo", { method: "POST", body: "hi" });
  assert.equal(await ok.text(), "hi");
  server.close();
});
