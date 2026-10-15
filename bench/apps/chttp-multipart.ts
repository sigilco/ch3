// chttp multipart gate — exercises the declared-multipart path end to end:
// memory + disk storage, fields, limits, and the 400/413 aborts. Kept as a
// bench-app-shaped entry so `scriptc coverage` proves the whole parse path
// (boundary scanner, sinks, fs writes) stays inside the compilable subset.
import { createRouter, diskStorage } from "../../packages/router/src/index.ts";
import { tmpdir } from "node:os";

const app = createRouter();

app.post(
  "/up",
  (c) => {
    const f = c.req.file("file");
    if (f === null || f.bytes === null) {
      return c.status(500).text("no file");
    }
    return c.json({
      title: c.req.field("title"),
      filename: f.filename,
      mime: f.mimeType,
      size: f.size,
    });
  },
  { multipart: { maxFileBytes: 64 * 1024 * 1024 } },
);

app.post(
  "/disk",
  (c) => {
    const f = c.req.file("media");
    if (f === null || f.path === null) {
      return c.status(500).text("no file");
    }
    return c.json({ path: f.path, size: f.size });
  },
  { multipart: { storage: diskStorage(tmpdir() + "/chttp-mp-gate") } },
);

app.post("/multi", (c) => c.json({ n: c.req.files("f").length, tags: c.req.fields("tag") }), {
  multipart: { maxFiles: 8 },
});

app.serve({ port: 8911 });
