import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRouter } from "@chttp/router";
import {
  DiskAssets,
  EmbeddedAssets,
  httpDate,
  isHashedName,
  mimeFor,
  serveStatic,
} from "../dist/esm/index.js";

const sha256 = (b) => createHash("sha256").update(b).digest("hex");

const root = mkdtempSync(join(tmpdir(), "chttp-static-"));
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x00]),
  randomBytes(4096),
]);
mkdirSync(join(root, "docs"));
mkdirSync(join(root, ".git"));
writeFileSync(join(root, "index.html"), "<h1>root</h1>");
writeFileSync(join(root, "docs", "index.html"), "<h1>docs</h1>");
writeFileSync(join(root, "logo.png"), png);
writeFileSync(join(root, "app.js"), "console.log(1)");
writeFileSync(join(root, "app.js.br"), "BR-BYTES");
writeFileSync(join(root, "app.js.gz"), "GZ-BYTES");
writeFileSync(join(root, "app-Ab3dE9fG.js"), "console.log(2)");
writeFileSync(join(root, ".env"), "SECRET=1");
writeFileSync(join(root, ".git", "config"), "x");
utimesSync(join(root, "logo.png"), 951782400, 951782400);
// A file outside the root that traversal must never reach.
writeFileSync(join(root, "..", "chttp-static-outside.txt"), "outside");

function boot(setup) {
  const app = createRouter();
  setup(app);
  return new Promise((resolve) => {
    const s = http.createServer(app.handler());
    s.listen(0, "127.0.0.1", () => resolve({ s, port: s.address().port }));
  });
}

// Raw request: node's http client does not normalise the path, so
// encoded traversal reaches the router untouched.
function req(port, path, { method = "GET", headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port, path, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () =>
        resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }),
      );
    });
    r.on("error", reject);
    r.end();
  });
}

const ctx = {};
test.before(async () => {
  ctx.main = await boot((app) => {
    app.get("/api/ping", (c) => c.json({ ok: true }));
    serveStatic(app, "/", new DiskAssets(root), { spa: true });
  });
  ctx.pre = await boot((app) => serveStatic(app, "/static", new DiskAssets(root)));
});
test.after(() => {
  ctx.main.s.close();
  ctx.pre.s.close();
});

test("serves binary bytes intact (sha256) with length and type", async () => {
  const r = await req(ctx.main.port, "/logo.png");
  assert.equal(r.status, 200);
  assert.equal(r.headers["content-type"], "image/png");
  assert.equal(r.headers["content-length"], String(png.length));
  assert.equal(sha256(r.body), sha256(png));
  assert.equal(r.headers["last-modified"], "Tue, 29 Feb 2000 00:00:00 GMT");
});

test("path traversal is refused (plain, encoded, backslash)", async () => {
  for (const p of [
    "/static/%2e%2e/chttp-static-outside.txt",
    "/static/..%2fchttp-static-outside.txt",
    "/static/%2e%2e%2fchttp-static-outside.txt",
    "/static/a/..%2f..%2fchttp-static-outside.txt",
    "/static/..%5cchttp-static-outside.txt",
    "/static/%00",
  ]) {
    const r = await req(ctx.pre.port, p);
    assert.ok(r.status === 403 || r.status === 404, p + " -> " + r.status);
    assert.ok(!r.body.toString().includes("outside"), p);
  }
});

test("dotfiles are hidden", async () => {
  assert.equal((await req(ctx.pre.port, "/static/.env")).status, 404);
  assert.equal((await req(ctx.pre.port, "/static/.git/config")).status, 404);
});

test("ETag round trip answers 304 with no body", async () => {
  const a = await req(ctx.main.port, "/app.js");
  const tag = a.headers.etag;
  assert.match(tag, /^"[0-9a-f]{40}"$/);
  const b = await req(ctx.main.port, "/app.js", { headers: { "if-none-match": tag } });
  assert.equal(b.status, 304);
  assert.equal(b.body.length, 0);
  assert.equal(b.headers.etag, tag);
  const w = await req(ctx.main.port, "/app.js", {
    headers: { "if-none-match": 'W/"nope", W/' + tag },
  });
  assert.equal(w.status, 304);
  const miss = await req(ctx.main.port, "/app.js", { headers: { "if-none-match": '"nope"' } });
  assert.equal(miss.status, 200);
});

test("HEAD returns headers and no body", async () => {
  const r = await req(ctx.main.port, "/logo.png", { method: "HEAD" });
  assert.equal(r.status, 200);
  assert.equal(r.headers["content-length"], String(png.length));
  assert.equal(r.body.length, 0);
});

test("directory index, with and without trailing slash", async () => {
  assert.equal((await req(ctx.main.port, "/")).body.toString(), "<h1>root</h1>");
  assert.equal((await req(ctx.main.port, "/docs/")).body.toString(), "<h1>docs</h1>");
  assert.equal((await req(ctx.main.port, "/docs")).body.toString(), "<h1>docs</h1>");
  assert.equal((await req(ctx.pre.port, "/static")).body.toString(), "<h1>root</h1>");
  assert.equal((await req(ctx.pre.port, "/static/")).body.toString(), "<h1>root</h1>");
});

test("cache-control: hashed immutable, html no-cache, other revalidate", async () => {
  const h = await req(ctx.main.port, "/app-Ab3dE9fG.js");
  assert.equal(h.headers["cache-control"], "public, max-age=31536000, immutable");
  assert.equal((await req(ctx.main.port, "/")).headers["cache-control"], "no-cache");
  assert.equal((await req(ctx.main.port, "/logo.png")).headers["cache-control"], "no-cache");
});

test("precompressed siblings by accept-encoding, with Vary", async () => {
  const br = await req(ctx.main.port, "/app.js", {
    headers: { "accept-encoding": "gzip, deflate, br" },
  });
  assert.equal(br.body.toString(), "BR-BYTES");
  assert.equal(br.headers["content-encoding"], "br");
  assert.equal(br.headers.vary, "accept-encoding");
  assert.equal(br.headers["content-type"], "text/javascript; charset=utf-8");
  const gz = await req(ctx.main.port, "/app.js", { headers: { "accept-encoding": "gzip" } });
  assert.equal(gz.body.toString(), "GZ-BYTES");
  assert.equal(gz.headers["content-encoding"], "gzip");
  const id = await req(ctx.main.port, "/app.js");
  assert.equal(id.body.toString(), "console.log(1)");
  assert.equal(id.headers["content-encoding"], undefined);
  assert.equal(id.headers.vary, "accept-encoding");
  assert.notEqual(br.headers.etag, id.headers.etag);
  assert.notEqual(br.headers.etag, gz.headers.etag);
});

test("SPA fallback: html navigations only, never assets or api", async () => {
  const html = { accept: "text/html,application/xhtml+xml" };
  const nav = await req(ctx.main.port, "/some/client/route", { headers: html });
  assert.equal(nav.status, 200);
  assert.equal(nav.body.toString(), "<h1>root</h1>");
  assert.equal(
    (await req(ctx.main.port, "/some/route", { headers: { accept: "*/*" } })).status,
    404,
  );
  assert.equal((await req(ctx.main.port, "/missing.js", { headers: html })).status, 404);
  assert.equal(
    (await req(ctx.main.port, "/some/route", { headers: html, method: "HEAD" })).status,
    200,
  );
  // spa is opt-in
  assert.equal((await req(ctx.pre.port, "/static/some/route", { headers: html })).status, 404);
});

test("/api stays JSON: real route, unmatched route, never the SPA shell", async () => {
  const ok = await req(ctx.main.port, "/api/ping", { headers: { accept: "text/html" } });
  assert.equal(JSON.parse(ok.body).ok, true);
  const miss = await req(ctx.main.port, "/api/nope", { headers: { accept: "text/html" } });
  assert.equal(miss.status, 404);
  assert.match(miss.headers["content-type"], /^application\/json/);
  assert.deepEqual(JSON.parse(miss.body), { error: "not_found" });
  assert.equal(
    (await req(ctx.main.port, "/api", { headers: { accept: "text/html" } })).status,
    404,
  );
});

test("non GET methods are refused by the router", async () => {
  const r = await req(ctx.main.port, "/app.js", { method: "POST" });
  assert.equal(r.status, 405);
});

test("DiskAssets revalidates on change and caches in between", async () => {
  const d = new DiskAssets(root);
  const a = d.get("app.js");
  assert.equal(d.get("app.js"), a);
  assert.equal(d.get("nope.js"), null);
  assert.equal(d.get("../chttp-static-outside.txt"), null);
  assert.equal(d.get("docs"), null);
  writeFileSync(join(root, "app.js"), "console.log(1000)");
  const b = d.get("app.js");
  assert.notEqual(b, a);
  assert.notEqual(b.etag, a.etag);
});

test("EmbeddedAssets.load serves baked records, including encodings", async () => {
  const e = new EmbeddedAssets();
  e.load([
    {
      path: "baked.js",
      type: "text/javascript; charset=utf-8",
      b64: Buffer.from("hi").toString("base64"),
      etag: "t1",
      mtimeMs: 0,
      immutable: true,
      encs: [{ enc: "br", b64: Buffer.from("BR").toString("base64"), etag: "t1-br" }],
    },
  ]);
  assert.equal(e.get("constructor"), null);
  const m = await boot((app) => serveStatic(app, "/e", e));
  try {
    const r = await req(m.port, "/e/baked.js", { headers: { "accept-encoding": "br" } });
    assert.equal(r.body.toString(), "BR");
    assert.equal(r.headers.etag, '"t1-br"');
    assert.equal(r.headers["last-modified"], undefined);
    assert.equal(r.headers["cache-control"], "public, max-age=31536000, immutable");
    const plain = await req(m.port, "/e/baked.js");
    assert.equal(plain.body.toString(), "hi");
  } finally {
    m.s.close();
  }
});

test("httpDate matches toUTCString", () => {
  for (const ms of [0, 951782400000, 1760400000123, 1709251199000]) {
    assert.equal(httpDate(ms), new Date(ms).toUTCString());
  }
});

test("isHashedName / mimeFor", () => {
  assert.ok(isHashedName("assets/index-DiKf8Zq1.js"));
  assert.ok(isHashedName("chunk.3f9a1c2e.css"));
  assert.ok(!isHashedName("app.js"));
  assert.ok(!isHashedName("report-20241014.pdf"));
  assert.ok(!isHashedName("some-descriptive-name.png"));
  assert.equal(mimeFor("a/b.PNG"), "image/png");
  assert.equal(mimeFor("a/b.unknown"), "application/octet-stream");
  assert.equal(mimeFor("Makefile"), "application/octet-stream");
  assert.equal(mimeFor("x.constructor"), "application/octet-stream");
});

// A file strictly outside the root for the symlink containment tests.
const outside = join(root, "..", "chttp-static-secret-outside.txt");
writeFileSync(outside, "OUTSIDE-SECRET");

try {
  symlinkSync(outside, join(root, "escape.txt"));
  symlinkSync(join(root, "app.js"), join(root, "inner.txt"));
  ctx.symlinks = true;
} catch (_e) {
  // Filesystem refuses symlinks; the containment tests skip below.
}

test("symlink escaping the webroot is not served (404)", { skip: !ctx.symlinks }, async () => {
  const r = await req(ctx.main.port, "/escape.txt");
  assert.equal(r.status, 404);
  assert.ok(!r.body.toString().includes("OUTSIDE-SECRET"));
  // And through the source directly, encoded variants included.
  const d = new DiskAssets(root);
  assert.equal(d.get("escape.txt"), null);
  assert.equal(d.get("docs/../escape.txt"), null);
});

test("symlink staying inside the webroot still serves", { skip: !ctx.symlinks }, async () => {
  const r = await req(ctx.main.port, "/inner.txt");
  assert.equal(r.status, 200);
  // inner.txt links to app.js, so it serves whatever app.js holds now.
  assert.equal(r.body.toString(), (await req(ctx.main.port, "/app.js")).body.toString());
});

test("q=0 excludes a coding: gzip;q=0 falls back to identity", async () => {
  const plain = await req(ctx.main.port, "/app.js");
  const r = await req(ctx.main.port, "/app.js", {
    headers: { "accept-encoding": "gzip;q=0" },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.toString(), plain.body.toString());
  assert.notEqual(r.body.toString(), "GZ-BYTES");
  assert.equal(r.headers["content-encoding"], undefined);
});

test("q=0 on one coding still allows the next: br;q=0.0, gzip -> gzip", async () => {
  const r = await req(ctx.main.port, "/app.js", {
    headers: { "accept-encoding": "br;q=0.0, gzip" },
  });
  assert.equal(r.body.toString(), "GZ-BYTES");
  assert.equal(r.headers["content-encoding"], "gzip");
});

test("codings match exactly, never by substring", async () => {
  const plain = await req(ctx.main.port, "/app.js");
  const r = await req(ctx.main.port, "/app.js", {
    headers: { "accept-encoding": "xgzip" },
  });
  assert.equal(r.body.toString(), plain.body.toString());
  assert.notEqual(r.body.toString(), "GZ-BYTES");
  assert.equal(r.headers["content-encoding"], undefined);
  // Same for the br token: "brotli" is not "br".
  const b = await req(ctx.main.port, "/app.js", {
    headers: { "accept-encoding": "brotli" },
  });
  assert.equal(b.headers["content-encoding"], undefined);
  assert.notEqual(b.body.toString(), "BR-BYTES");
});

test("drive-letter tails answer 403", async () => {
  const r = await req(ctx.pre.port, "/static/C:/etc/passwd");
  assert.equal(r.status, 403);
  assert.equal((await req(ctx.pre.port, "/static/C%3A/etc/passwd")).status, 403);
});

test("empty file: 200, zero length, valid etag", async () => {
  writeFileSync(join(root, "empty.txt"), "");
  const r = await req(ctx.main.port, "/empty.txt");
  assert.equal(r.status, 200);
  assert.equal(r.headers["content-length"], "0");
  assert.equal(r.body.length, 0);
  assert.match(r.headers.etag, /^"[0-9a-f]{40}"$/);
  // The etag round-trips through If-None-Match like any other asset.
  assert.equal(
    (await req(ctx.main.port, "/empty.txt", { headers: { "if-none-match": r.headers.etag } }))
      .status,
    304,
  );
});

test("query strings are stripped by the router, asset still served", async () => {
  const plain = await req(ctx.main.port, "/app.js");
  const r = await req(ctx.main.port, "/app.js?v=2");
  assert.equal(r.status, 200);
  assert.equal(r.body.toString(), plain.body.toString());
});

test("percent-encoded dotfile stays hidden", async () => {
  // The router decodes %2e, so static sees ".env" and answers 404
  // (dotfiles 404, never 403, so the filesystem is never probed).
  const r = await req(ctx.pre.port, "/static/%2eenv");
  assert.equal(r.status, 404);
  assert.ok(!r.body.toString().includes("SECRET"));
});
