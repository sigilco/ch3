// chttp + @chttp/static compile gate: serves a directory (argv[3]) under
// /, SPA fallback on, JSON 404 under /api, plus one embedded record to
// keep EmbeddedAssets.load in the coverage surface.
import { createRouter } from "@chttp/router";
import { DiskAssets, EmbeddedAssets, serveStatic } from "./src/index.ts";
import type { EmbedRecord } from "./src/index.ts";

const app = createRouter();

app.get("/api/ping", (c) => c.json({ ok: true }));

const emb = new EmbeddedAssets();
const recs: EmbedRecord[] = [
  {
    path: "baked.txt",
    type: "text/plain; charset=utf-8",
    b64: "aGVsbG8=",
    etag: "baked1",
    mtimeMs: 0,
    immutable: false,
    encs: [],
  },
];
emb.load(recs);
serveStatic(app, "/embedded", emb);
serveStatic(app, "/", new DiskAssets(process.argv[3] || "./public"), { spa: true });

app.serve({ port: Number(process.argv[2] || 3000) });
