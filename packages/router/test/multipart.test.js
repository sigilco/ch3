// Multipart upload end-to-end: real http round-trips through app.serve()
// plus the app.fetch Web Standards entry. Raw bodies are hand-built so the
// exact wire bytes (boundary placement, CRLFs, binary content) are fixed.
import * as assert from "node:assert";
import test from "node:test";
import { createRouter, diskStorage } from "../dist/esm/index.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const B = "----chttpTestBoundary";

function mpBody(parts) {
  // parts: { name, value } | { name, filename, contentType, data (string|Buffer) }
  const chunks = [];
  for (const p of parts) {
    chunks.push(Buffer.from("--" + B + "\r\n"));
    let cd = 'Content-Disposition: form-data; name="' + p.name + '"';
    if (p.filename !== undefined) {
      cd += '; filename="' + p.filename + '"';
    }
    chunks.push(Buffer.from(cd + "\r\n"));
    if (p.filename !== undefined) {
      chunks.push(
        Buffer.from("Content-Type: " + (p.contentType || "application/octet-stream") + "\r\n"),
      );
    }
    chunks.push(Buffer.from("\r\n"));
    chunks.push(Buffer.isBuffer(p.data) ? p.data : Buffer.from(String(p.data ?? p.value)));
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from("--" + B + "--\r\n"));
  return Buffer.concat(chunks);
}

async function serve(app) {
  const srv = app.serve({ port: 0 });
  await new Promise((r) => srv.on("listening", r));
  const port = srv.address().port;
  return {
    port,
    close: () => srv.close(),
    post: (p, body, ct) =>
      fetch("http://127.0.0.1:" + port + p, {
        method: "POST",
        headers: { "content-type": ct || "multipart/form-data; boundary=" + B },
        body,
      }),
  };
}

test("multipart: fields and a memory file land on c.req", async () => {
  const app = createRouter();
  app.post(
    "/up",
    (c) => {
      const f = c.req.file("file");
      return c.json({
        title: c.req.field("title"),
        name: f === null ? null : f.filename,
        mime: f === null ? null : f.mimeType,
        size: f === null ? null : f.size,
        bytes: f === null ? null : Buffer.from(f.bytes).toString("utf8"),
      });
    },
    { multipart: {} },
  );
  const { post, close } = await serve(app);
  const body = mpBody([
    { name: "title", value: "hello world" },
    { name: "file", filename: "note.txt", contentType: "text/plain", data: "file contents!" },
  ]);
  const r = await post("/up", body);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), {
    title: "hello world",
    name: "note.txt",
    mime: "text/plain",
    size: 14,
    bytes: "file contents!",
  });
  close();
});

test("multipart: binary bytes survive byte-exact", async () => {
  const app = createRouter();
  app.post(
    "/bin",
    (c) => {
      const f = c.req.file("blob");
      if (f === null) return c.status(500).text("no file");
      return c.json({ len: f.size, sum: f.bytes.reduce((a, b) => a + b, 0) });
    },
    { multipart: {} },
  );
  const { post, close } = await serve(app);
  const bin = Buffer.alloc(256);
  for (let i = 0; i < 256; i++) bin[i] = i; // every byte value incl. \r \n - .
  const r = await post("/bin", mpBody([{ name: "blob", filename: "b.bin", data: bin }]));
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.len, 256);
  assert.equal(j.sum, 32640); // sum 0..255
  close();
});

test("multipart: diskStorage streams to a temp file, path exposed", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chttp-mp-"));
  const app = createRouter();
  app.post(
    "/disk",
    (c) => {
      const f = c.req.file("media");
      if (f === null || f.path === null) return c.status(500).text("no file");
      const onDisk = fs.readFileSync(f.path);
      return c.json({
        filename: f.filename,
        size: f.size,
        matches: onDisk.equals(Buffer.from("DISKDATA")),
        inDir: f.path.startsWith(dir),
      });
    },
    { multipart: { storage: diskStorage(dir) } },
  );
  const { post, close } = await serve(app);
  const r = await post("/disk", mpBody([{ name: "media", filename: "a.mp3", data: "DISKDATA" }]));
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.filename, "a.mp3");
  assert.equal(j.size, 8);
  assert.equal(j.matches, true);
  assert.equal(j.inDir, true);
  fs.rmSync(dir, { recursive: true, force: true });
  close();
});

test("multipart: last-wins file()/field(), all via files()/fields()", async () => {
  const app = createRouter();
  app.post(
    "/multi",
    (c) => {
      const last = c.req.file("f");
      const all = c.req.files("f");
      const g = c.req.file("g"); // absent
      return c.json({
        last: last === null ? null : last.filename,
        count: all.length,
        names: all.map((x) => x.filename),
        g: g === null ? "null" : "x",
        field: c.req.field("tag"),
        tags: c.req.fields("tag"),
      });
    },
    { multipart: {} },
  );
  const { post, close } = await serve(app);
  const r = await post(
    "/multi",
    mpBody([
      { name: "f", filename: "one.txt", data: "1" },
      { name: "tag", value: "a" },
      { name: "f", filename: "two.txt", data: "2" },
      { name: "tag", value: "b" },
    ]),
  );
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), {
    last: "two.txt",
    count: 2,
    names: ["one.txt", "two.txt"],
    g: "null",
    field: "b",
    tags: ["a", "b"],
  });
  close();
});

test("multipart: path-traversal filename is basename-sanitized", async () => {
  const app = createRouter();
  app.post(
    "/trav",
    (c) => {
      const f = c.req.file("file");
      return c.json({ filename: f === null ? null : f.filename });
    },
    { multipart: {} },
  );
  const { post, close } = await serve(app);
  const r = await post(
    "/trav",
    mpBody([{ name: "file", filename: "../../etc/passwd", data: "x" }]),
  );
  const j = await r.json();
  assert.equal(j.filename, "passwd");
  close();
});

test("multipart: maxFileBytes breach answers 413", async () => {
  const app = createRouter();
  app.post("/cap", (c) => c.text("unreachable"), {
    multipart: { maxFileBytes: 4 },
  });
  const { post, close } = await serve(app);
  const r = await post(
    "/cap",
    mpBody([{ name: "file", filename: "big.bin", data: Buffer.alloc(1024, 65) }]),
  );
  assert.equal(r.status, 413);
  close();
});

test("multipart: maxFiles breach answers 413", async () => {
  const app = createRouter();
  app.post("/nfiles", (c) => c.text("unreachable"), {
    multipart: { maxFiles: 1 },
  });
  const { post, close } = await serve(app);
  const r = await post(
    "/nfiles",
    mpBody([
      { name: "a", filename: "1.txt", data: "x" },
      { name: "b", filename: "2.txt", data: "y" },
    ]),
  );
  assert.equal(r.status, 413);
  close();
});

test("multipart: maxFieldBytes breach answers 413", async () => {
  const app = createRouter();
  app.post("/fld", (c) => c.text("unreachable"), {
    multipart: { maxFieldBytes: 4 },
  });
  const { post, close } = await serve(app);
  const r = await post("/fld", mpBody([{ name: "bio", value: "a long biography indeed" }]));
  assert.equal(r.status, 413);
  close();
});

test("multipart: 413 abort unlinks the partial temp file", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chttp-mp-abort-"));
  const app = createRouter();
  app.post("/abort", (c) => c.text("unreachable"), {
    multipart: { storage: diskStorage(dir), maxFileBytes: 8 },
  });
  const { post, close } = await serve(app);
  const r = await post(
    "/abort",
    mpBody([{ name: "file", filename: "big.bin", data: Buffer.alloc(4096, 66) }]),
  );
  assert.equal(r.status, 413);
  // Let the abort cleanup settle before asserting the dir is empty.
  await new Promise((r2) => setTimeout(r2, 50));
  assert.deepEqual(fs.readdirSync(dir), []);
  fs.rmSync(dir, { recursive: true, force: true });
  close();
});

test("multipart: non-multipart content-type answers 400", async () => {
  const app = createRouter();
  app.post("/up", (c) => c.text("unreachable"), { multipart: {} });
  const { post, close } = await serve(app);
  const r = await post("/up", Buffer.from("plain text"), "text/plain");
  assert.equal(r.status, 400);
  close();
});

test("multipart: missing boundary answers 400", async () => {
  const app = createRouter();
  app.post("/up", (c) => c.text("unreachable"), { multipart: {} });
  const { post, close } = await serve(app);
  const r = await post("/up", Buffer.from("x"), "multipart/form-data");
  assert.equal(r.status, 400);
  close();
});

test("multipart: truncated body answers 400", async () => {
  const app = createRouter();
  app.post("/up", (c) => c.text("unreachable"), { multipart: {} });
  const { post, close } = await serve(app);
  const body = mpBody([{ name: "a", value: "v" }]);
  const r = await post("/up", body.subarray(0, body.length - 20));
  assert.equal(r.status, 400);
  close();
});

test("multipart: route without the declaration ignores the body", async () => {
  const app = createRouter();
  app.post("/plain", (c) => c.json({ body: c.req.body(), f: c.req.file("x") === null }));
  const { post, close } = await serve(app);
  const r = await post("/plain", mpBody([{ name: "x", filename: "f", data: "z" }]));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { body: "", f: true });
  close();
});

test("multipart: body+multipart in one opts throws at registration", () => {
  const app = createRouter();
  assert.throws(
    () => app.post("/x", (c) => c.text("no"), { body: true, multipart: {} }),
    /mutually exclusive/,
  );
});

test("multipart: app.fetch entry parses form data", async () => {
  const app = createRouter();
  app.post(
    "/up",
    (c) => {
      const f = c.req.file("file");
      return c.json({
        t: c.req.field("title"),
        fn: f === null ? null : f.filename,
        data: f === null ? null : Buffer.from(f.bytes).toString("utf8"),
      });
    },
    { multipart: {} },
  );
  const fd = new FormData();
  fd.append("title", "via fetch");
  fd.append("file", new Blob(["fetch bytes"]), "f.txt");
  const r = await app.fetch(new Request("http://x/up", { method: "POST", body: fd }));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { t: "via fetch", fn: "f.txt", data: "fetch bytes" });
});

test("multipart: fetchShim entry parses a string-carried body", async () => {
  const app = createRouter();
  app.post("/up", (c) => c.json({ t: c.req.field("title") }), { multipart: {} });
  const body = mpBody([{ name: "title", value: "shim" }]).toString("utf8");
  const out = await new Promise((resolve) => {
    app.fetchShim(
      "POST",
      "/up",
      { "content-type": "multipart/form-data; boundary=" + B },
      body,
      (status, hdrList, outBody) => resolve({ status, outBody }),
    );
  });
  assert.equal(out.status, 200);
  assert.deepEqual(JSON.parse(out.outBody), { t: "shim" });
});

test("multipart: middleware runs before parse result is visible", async () => {
  const app = createRouter();
  app.use((c, next) => {
    c.set("mw", "ran");
    return next();
  });
  app.post("/mw", (c) => c.json({ mw: c.get("mw"), t: c.req.field("title") }), {
    multipart: {},
  });
  const { post, close } = await serve(app);
  const r = await post("/mw", mpBody([{ name: "title", value: "with mw" }]));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { mw: "ran", t: "with mw" });
  close();
});

test("multipart: chunked trickle feeds still parse (split boundaries)", async () => {
  const app = createRouter();
  app.post(
    "/slow",
    (c) => {
      const f = c.req.file("file");
      return c.json({
        t: c.req.field("title"),
        data: f === null ? null : Buffer.from(f.bytes).toString("utf8"),
      });
    },
    { multipart: {} },
  );
  const srv = app.serve({ port: 0 });
  await new Promise((r) => srv.on("listening", r));
  const port = srv.address().port;
  const payload = mpBody([
    { name: "title", value: "trickle" },
    { name: "file", filename: "s.bin", data: Buffer.alloc(5000, 88) },
  ]);
  const result = await new Promise((resolve, reject) => {
    const req = (async () => {
      const http = await import("node:http");
      const rq = http.request(
        {
          host: "127.0.0.1",
          port,
          path: "/slow",
          method: "POST",
          headers: {
            "content-type": "multipart/form-data; boundary=" + B,
            "transfer-encoding": "chunked",
          },
        },
        (res) => {
          const bufs = [];
          res.on("data", (d) => bufs.push(d));
          res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(bufs) }));
        },
      );
      // 7-byte writes split every delimiter across chunks.
      for (let i = 0; i < payload.length; i += 7) {
        rq.write(payload.subarray(i, Math.min(i + 7, payload.length)));
      }
      rq.end();
      rq.on("error", reject);
    })();
    req.catch(reject);
  });
  assert.equal(result.status, 200);
  const j = JSON.parse(result.body.toString());
  assert.equal(j.t, "trickle");
  assert.equal(j.data.length, 5000);
  srv.close();
});
