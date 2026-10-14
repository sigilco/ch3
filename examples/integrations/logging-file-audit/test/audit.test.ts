import assert from "node:assert";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../src/app.ts";
import { fileAudit } from "../src/audit.ts";

test("requests and login outcomes land in the audit file", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "audit-")), "audit.log");
  const app = createApp((level, message) => fileAudit(file, level, message));
  const srv = app.serve({ port: 0 });
  await new Promise((r) => srv.on("listening", r));
  const base = "http://127.0.0.1:" + (srv.address() as { port: number }).port;

  assert.equal((await fetch(base + "/users/7")).status, 200);
  assert.equal((await fetch(base + "/login", { method: "POST" })).status, 400);
  assert.equal((await fetch(base + "/login", { method: "POST", body: "x" })).status, 200);
  srv.close();

  const lines = readFileSync(file, "utf8").trim().split("\n");
  assert.equal(lines.length, 5);
  assert.match(lines[0], /^\d{4}-\d\d-\d\dT[\d:.]+Z \[INF\] audit: GET \/users\/7 \d+ms$/);
  assert.match(lines[1], /\[WRN\] audit: login rejected: empty body$/);
  assert.match(lines[2], /\[INF\] audit: POST \/login \d+ms$/);
  assert.match(lines[3], /\[INF\] audit: login accepted$/);
});
