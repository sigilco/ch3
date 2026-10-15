import type { App, Ctx } from "@chttp/router";
import type { ServerResponse } from "node:http";
import { extOf } from "./mime.ts";
import { httpDate } from "./date.ts";
import type { Asset, AssetSource, AssetVariant } from "./asset.ts";

// Opt-in behaviour. Every field is optional; defaults are applied in the
// StaticServer constructor with explicit undefined guards (the subset has
// no `?? `-style narrowing on optional record members).
export interface StaticOpts {
  // Serve the index file for extensionless HTML navigations that match no
  // asset (client-side routing). Default false.
  spa?: boolean;
  // Path prefixes owned by the API: never SPA-fallback, and an unmatched
  // request there answers a JSON 404. Default ["/api"].
  api?: string[];
  // Directory index and SPA shell. Default "index.html".
  index?: string;
  // Cache-Control for assets that are neither hashed nor HTML.
  // Default "no-cache" (always revalidate via ETag).
  cacheControl?: string;
}

const IMMUTABLE_CC = "public, max-age=31536000, immutable";

// Splat tail checks. `rel` is already percent-decoded by the router, so
// `%2e%2e` and `..%2f` arrive as `..` segments. Rejects parent segments,
// backslashes, NUL, drive-letter tails and absolute tails.
function traversal(rel: string): boolean {
  if (rel.charAt(0) === "/") {
    return true;
  }
  if (rel.indexOf("\\") !== -1 || rel.indexOf("\0") !== -1 || rel.indexOf(":") !== -1) {
    return true;
  }
  const segs = rel.split("/");
  for (let i = 0; i < segs.length; i++) {
    if (segs[i] === "..") {
      return true;
    }
  }
  return false;
}

// Dotfiles (.env, .git/...) are never served, except /.well-known/.
function hidden(rel: string): boolean {
  const segs = rel.split("/");
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.length > 0 && s.charAt(0) === "." && s !== ".well-known") {
      return true;
    }
  }
  return false;
}

// Does an If-None-Match header value match the (quoted) entity tag?
// Weak prefixes are ignored (weak comparison, RFC 9110 section 13.1.2).
export function etagMatches(header: string, tag: string): boolean {
  const parts = header.split(",");
  for (let i = 0; i < parts.length; i++) {
    let p = parts[i].trim();
    if (p === "*") {
      return true;
    }
    if (p.startsWith("W/")) {
      p = p.slice(2);
    }
    if (p === tag) {
      return true;
    }
  }
  return false;
}

export class StaticServer {
  src: AssetSource;
  spa: boolean;
  api: string[];
  index: string;
  cc: string;

  constructor(src: AssetSource, opts: StaticOpts | undefined) {
    this.src = src;
    this.spa = false;
    this.api = ["/api"];
    this.index = "index.html";
    this.cc = "no-cache";
    if (opts !== undefined && opts !== null) {
      if (opts.spa === true) {
        this.spa = true;
      }
      if (opts.api !== undefined) {
        this.api = opts.api;
      }
      if (opts.index !== undefined) {
        this.index = opts.index;
      }
      if (opts.cacheControl !== undefined) {
        this.cc = opts.cacheControl;
      }
    }
  }

  isApi(path: string): boolean {
    for (let i = 0; i < this.api.length; i++) {
      const p = this.api[i];
      if (path === p || path.startsWith(p + "/")) {
        return true;
      }
    }
    return false;
  }

  handle(c: Ctx): unknown {
    if (this.isApi(c.req.path)) {
      return c.status(404).json({ error: "not_found" });
    }
    const raw = c.req.param("*");
    const rel = raw === null ? "" : String(raw);
    if (traversal(rel)) {
      return c.status(403).text("Forbidden");
    }
    if (hidden(rel)) {
      return c.status(404).text("Not Found");
    }
    const ext = extOf(rel);
    let a: Asset | null = null;
    if (rel === "" || rel.charAt(rel.length - 1) === "/") {
      a = this.src.get(rel + this.index);
    } else {
      a = this.src.get(rel);
      if (a === null && ext === "") {
        a = this.src.get(rel + "/" + this.index);
      }
    }
    if (a === null && this.spa && ext === "") {
      const acc = c.req.header("accept");
      if (acc !== null && acc.indexOf("text/html") !== -1) {
        a = this.src.get(this.index);
      }
    }
    if (a === null) {
      return c.status(404).text("Not Found");
    }
    return this.send(c, a);
  }

  send(c: Ctx, a: Asset): Ctx {
    let body: Buffer = a.body;
    let etag: string = a.etag;
    if (a.encodings.length > 0) {
      c.header("vary", "accept-encoding");
      const ae = c.req.header("accept-encoding");
      if (ae !== null) {
        const v = this.pick(a, ae);
        if (v !== null) {
          body = v.body;
          etag = v.etag;
          c.header("content-encoding", v.enc);
        }
      }
    }
    const tag = '"' + etag + '"';
    c.header("etag", tag);
    if (a.immutable) {
      c.header("cache-control", IMMUTABLE_CC);
    } else if (a.type.startsWith("text/html")) {
      c.header("cache-control", "no-cache");
    } else {
      c.header("cache-control", this.cc);
    }
    if (a.mtimeMs > 0) {
      c.header("last-modified", httpDate(a.mtimeMs));
    }
    const inm = c.req.header("if-none-match");
    if (inm !== null && etagMatches(inm, tag)) {
      c.status(304);
      // Static serves only through the Node handler surface (the Fetch
      // surface returns a Response directly). _nodeRes is the underlying
      // ServerResponse; using the field avoids the nullable c.res getter.
      const rs = c._nodeRes as ServerResponse;
      rs.end();
      c.sent = true;
      return c;
    }
    return c.bytes(body, a.type);
  }

  // Brotli beats gzip when the client lists both: fixed br-then-gzip
  // preference, so q-values are honoured only as an exclusion (q=0 drops a
  // coding, anything else keeps it) and match exactly, never by substring.
  pick(a: Asset, ae: string): AssetVariant | null {
    const order = ["br", "gzip"];
    for (let i = 0; i < order.length; i++) {
      if (!acceptable(ae, [order[i]])) {
        continue;
      }
      for (let j = 0; j < a.encodings.length; j++) {
        if (a.encodings[j].enc === order[i]) {
          return a.encodings[j];
        }
      }
    }
    return null;
  }
}

// Is the (single) content coding accepted by this accept-encoding header?
// Members are comma-separated; each may carry `;q=` parameters. A member
// with q=0 (any number of zeros after the dot) is excluded outright; every
// other q-value ranks as acceptable because ranking is not attempted.
// `*` keeps its old meaning: any coding not explicitly excluded matches.
// Matching is exact on the lowercased token, never a substring test.
function acceptable(ae: string, encs: string[]): boolean {
  const parts = ae.split(",");
  for (let i = 0; i < parts.length; i++) {
    const member = parts[i];
    const qi = member.indexOf(";");
    let head: string = member;
    if (qi !== -1) {
      head = member.slice(0, qi);
    }
    const coding = head.trim().toLowerCase();
    // q is the first parameter; the value runs to the next ";" when other
    // parameters follow, and matching it is case-insensitive.
    let excluded = false;
    if (qi !== -1) {
      const params = member.slice(qi + 1).toLowerCase();
      const pi = params.indexOf("q=");
      if (pi !== -1) {
        let v = params.slice(pi + 2);
        const si = v.indexOf(";");
        if (si !== -1) {
          v = v.slice(0, si);
        }
        v = v.trim();
        // Exclusion is "0" or "0" then "." and zeros only ("0.000"): the
        // whole qvalue range the RFC grammar allows for q=0.
        if (v.charAt(0) === "0") {
          excluded = true;
          for (let k = 1; k < v.length; k++) {
            const ch = v.charAt(k);
            if (ch !== "." && ch !== "0") {
              excluded = false;
              break;
            }
          }
        }
      }
    }
    if (excluded) {
      continue;
    }
    if (coding === "*") {
      return true;
    }
    for (let j = 0; j < encs.length; j++) {
      if (coding === encs[j]) {
        return true;
      }
    }
  }
  return false;
}

// Register GET (and HEAD, via the router's fallback) under `prefix`:
// "" or "/" serves from the root, "/assets" serves /assets/*.
export function serveStatic(app: App, prefix: string, src: AssetSource, opts?: StaticOpts): App {
  const srv = new StaticServer(src, opts);
  let base = prefix;
  while (base.length > 0 && base.charAt(base.length - 1) === "/") {
    base = base.slice(0, base.length - 1);
  }
  app.get(base + "/*", (c: Ctx) => srv.handle(c));
  app.get(base === "" ? "/" : base, (c: Ctx) => srv.handle(c));
  return app;
}
