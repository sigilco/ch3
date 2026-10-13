// ch3 — minimal synchronous HTTP router for node:http.
// Authored inside the scriptc compilable subset so `scriptc build` can
// statically lower the whole package into a native binary:
//   - sync handlers only; `| null` unions, never `| undefined`
//   - plain ({}) records for route data; real classes for Ctx/ReqView/App
//   - indexed `for` loops only; `.pop()` statements, never expressions
//   - no object/method shorthand in literals, no `?.`/`??`, no eval/new Function
//   - no Object.create(null)/freeze, no Map/Set/RegExp on the hot path
//   - no spread, no array slice/concat on package paths (SC2020)
//   - no function values inside records — handlers live in App._fns and
//     nodes store numeric indices (function-typed record fields degrade
//     the instantiation to `unknown` and fence every method call on them)
//   - no recursion for matching — an explicit frame stack; recursive calls
//     monomorphize an `unknown` instantiation that fences lazy sites
//   - String(x)/Number(x) coercion at function entry for params that
//     arrive `unknown` (SC1090 "string methods as values")
//   - body via req.on('data'|'end') + string concat (Buffer.concat unlowered)
//   - res.end() always statement-called (result use is deferred)

import * as http from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { GenDispatch } from "./gen.ts";
import type { DispatchFn } from "./gen.ts";

export { GenDispatch };
export type { DispatchFn };

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

// Shared immutable defaults for ReqView's unbound param tables — read
// only, never mutated (nothing writes _pn/_pi after construction).
const EMPTY_S: string[] = [];
const EMPTY_N: number[] = [];

export class ReqView<P extends string = string> {
  raw: IncomingMessage;
  method: string;
  path: string;
  _qs: string;
  _qp: string[] | null;
  // Lazy param materialization: _pm stays null until the first param()/
  // splat read, then fills once from the matched entry's declared
  // (name, seg-index) positions — dispatch does zero param work for
  // handlers that never read params. _pn/_pi/_sp come from registration
  // metadata (see pathMeta); generated dispatch seeds _pm directly.
  _pm: string[] | null;
  _pn: string[];
  _pi: number[];
  _sp: number;
  _body: string;

  constructor(raw: IncomingMessage, qs: string, path: string) {
    this.raw = raw;
    this.method = String(raw.method || "");
    this._qs = String(qs);
    this._qp = null;
    this._pm = null;
    this._pn = EMPTY_S;
    this._pi = EMPTY_N;
    this._sp = -1;
    this._body = "";
    this.path = String(path);
  }

  // param() takes `string`, not ParamKey<P>: conditional types never
  // resolve under eager program-code instantiation (SC2001 — the h3-shim
  // report). ParamKey<P> stays exported for .d.ts consumers and any
  // future lazy-instantiation surface; P is still carried on Ctx.
  param(name: string): string | null {
    const n = String(name);
    const pm = this._pmNow();
    for (let i = 0; i < pm.length; i += 2) {
      if (pm[i] === n) {
        return String(pm[i + 1]);
      }
    }
    return null;
  }

  // Generated dispatch (docs/route-contract.md) installs pre-materialized
  // decoded pairs — flat [name, value, ...] including '*' for a splat.
  _seedPm(pm: string[]): void {
    this._pm = pm;
  }

  _pmNow(): string[] {
    const pm = this._pm;
    if (pm !== null) {
      return pm;
    }
    const out: string[] = [];
    const pn = this._pn;
    const sp = this._sp;
    if (pn.length > 0 || sp >= 0) {
      const segs = String(this.path).split("/");
      for (let i = 0; i < pn.length; i++) {
        const idx = this._pi[i];
        let v = "";
        if (idx < segs.length) {
          v = String(segs[idx]);
        }
        out.push(pn[i]);
        out.push(dec(v));
      }
      if (sp >= 0) {
        let tail = "";
        for (let j = sp; j < segs.length; j++) {
          if (j > sp) {
            tail = tail + "/";
          }
          tail = tail + String(segs[j]);
        }
        out.push("*");
        out.push(dec(tail));
      }
    }
    this._pm = out;
    return out;
  }

  query(name: string): string | null {
    const n = String(name);
    const qp = this._parsed();
    for (let i = 0; i < qp.length; i += 2) {
      if (qp[i] === n) {
        return String(qp[i + 1]);
      }
    }
    return null;
  }

  queryAll(): Record<string, string> {
    const qp = this._parsed();
    const out: Record<string, string> = {};
    for (let i = 0; i < qp.length; i += 2) {
      const k = String(qp[i]);
      out[k] = String(qp[i + 1]);
    }
    return out;
  }

  // All values for a repeated query key, first-seen order. Returns the
  // shared empty array when absent — read-only, never mutated.
  queries(name: string): string[] {
    const n = String(name);
    const qp = this._parsed();
    let out: string[] | null = null;
    for (let i = 0; i < qp.length; i += 2) {
      if (qp[i] === n) {
        if (out === null) {
          out = [];
        }
        out.push(String(qp[i + 1]));
      }
    }
    if (out === null) {
      return EMPTY_S;
    }
    return out;
  }

  header(name: string): string | null {
    const key = String(name).toLowerCase();
    const v = this.raw.headers[key];
    if (typeof v === "string") {
      return String(v);
    }
    // Repeated-value arm via headersDistinct (string[] | undefined — a
    // union with no `string` member, so the check narrows cleanly; the
    // `headers` union collapses to never after the failed typeof, SC0001,
    // and an unknown-cast mismatches the union layout, SC2003). Node keeps
    // only unjoinable headers (set-cookie, cookie) as arrays in `headers`,
    // so d[0] === v[0] here — identical semantics to reading v[0].
    const d = this.raw.headersDistinct[key];
    if (d !== undefined && d.length > 0) {
      return String(d[0]);
    }
    return null;
  }

  body(): string {
    return String(this._body);
  }

  _setBody(s: string): void {
    this._body = String(s);
  }

  _parsed(): string[] {
    const cached = this._qp;
    if (cached !== null) {
      return cached;
    }
    const out: string[] = [];
    const qs = String(this._qs);
    if (qs.length > 0) {
      const parts = qs.split("&");
      for (let i = 0; i < parts.length; i++) {
        const p = String(parts[i]);
        const eq = p.indexOf("=");
        if (eq < 0) {
          out.push(dec(p));
          out.push("");
        } else {
          out.push(dec(p.slice(0, eq)));
          out.push(dec(p.slice(eq + 1)));
        }
      }
    }
    this._qp = out;
    return out;
  }
}

export class Ctx<P extends string = string> {
  req: ReqView<P>;
  res: ServerResponse;
  _status: number;
  // True once a body-carrying helper (_send/redirect) flushed the response.
  // runOnError reads it: an onError that already answered must not get a
  // second 500 write.
  sent: boolean;

  constructor(req: ReqView<P>, res: ServerResponse) {
    this.req = req;
    this.res = res;
    this._status = 200;
    this.sent = false;
  }

  status(n: number): Ctx<P> {
    const code = Number(n);
    this._status = code;
    this.res.statusCode = code;
    return this;
  }

  header(k: string, v: string): Ctx<P> {
    this.res.setHeader(String(k), String(v));
    return this;
  }

  json(o: unknown): Ctx<P> {
    const t = JSON.stringify(o);
    let s = "null";
    if (typeof t === "string") {
      s = t;
    }
    return this._send(s, "application/json; charset=utf-8");
  }

  text(s: string): Ctx<P> {
    return this._send(String(s), "text/plain; charset=utf-8");
  }

  html(s: string): Ctx<P> {
    return this._send(String(s), "text/html; charset=utf-8");
  }

  redirect(url: string): Ctx<P>;
  redirect(url: string, code: number): Ctx<P>;
  redirect(url: string, code?: number): Ctx<P> {
    const n = code === null || code === undefined ? 302 : Number(code);
    this.status(n);
    this.res.setHeader("location", String(url));
    this.res.end();
    this.sent = true;
    return this;
  }

  _send(s: string, ct: string): Ctx<P> {
    const b = String(s);
    this.res.statusCode = this._status;
    this.res.setHeader("content-type", ct);
    this.res.setHeader("content-length", String(utf8len(b)));
    this.res.end(b);
    this.sent = true;
    return this;
  }
}

// Param names inferred from a path literal: '/user/:id' -> 'id',
// '/a/:x/b/:y' -> 'x' | 'y', '/w/*' -> '*'. Degrades to `string` when the
// path has no params so param() never becomes uncallable. The leading
// `string extends P` guard must stay first: it short-circuits the
// template-literal matching when P is unbound (`string`) so eager
// program-code instantiation resolves a concrete `string` (SC2001
// otherwise), while literal paths still get full inference under tsc and
// per-call-site scriptc instantiation.
export type ParamKey<P extends string> = string extends P
  ? string
  : P extends `${infer _Head}:${infer Rest}`
    ? Rest extends `${infer K}/${infer Tail}`
      ? K | ParamKey<`/${Tail}`>
      : Rest | (P extends `${string}/*` ? "*" : never)
    : P extends `${string}/*`
      ? "*"
      : string;

export type Handler = (c: Ctx) => void | Promise<void>;
export type Next = () => void | Promise<void>;
export type Middleware = (c: Ctx, next: Next) => void | Promise<void>;

// Route registration options. `body: true` declares body use — the
// deterministic opt-in that lets dispatch buffer the request body only
// for routes that asked for it (docs/route-contract.md).
export interface RouteOpts {
  body?: boolean;
}

function bodyFlag(opts: RouteOpts | undefined): number {
  if (opts === undefined || opts === null) {
    return 0;
  }
  if (opts.body === true) {
    return 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Route table: a trie of plain records. kinds: 0 static, 1 :param, 2 * wildcard.
// Handlers are stored as indices into App._fns (never function values in
// records); methods and middleware snapshots sit in parallel arrays.
// ---------------------------------------------------------------------------

interface RouteNode {
  seg: string;
  kind: number;
  // children holds indices into the owning App._nodes table: a
  // `RouteNode[]` member self-references the record and is rejected under
  // eager program-code instantiation (SC2009), while boxed `unknown[]`
  // reads degrade dispatch — integer indices keep every member concrete.
  children: number[];
  hm: string[];
  // hf[i] is the entry index for hm[i]'s method into App._fns/_mws —
  // function arrays (incl. nested Middleware[][]) cannot live inside
  // records under eager instantiation, so handlers AND their middleware
  // snapshots both live in parallel class-side arrays.
  hf: number[];
}

interface Frame {
  node: RouteNode;
  // pos is the start index (in path) of the next segment to try;
  // pos > len is the leaf-check state (all segments consumed).
  pos: number;
}

function newNode(nodes: RouteNode[], seg: string, kind: number): number {
  nodes.push({
    seg: String(seg),
    kind: Number(kind),
    children: [],
    hm: [],
    hf: [],
  });
  return nodes.length - 1;
}

function addRoute(nodes: RouteNode[], method: string, path: string, hIdx: number): void {
  const m = String(method);
  const p = String(path);
  if (p === "" || p.charAt(0) !== "/") {
    throw new Error("ch3: route path must start with /");
  }
  const segs = p.split("/");
  let ni = 0;
  for (let i = 1; i < segs.length; i++) {
    let seg = String(segs[i]);
    let kind = 0;
    if (seg === "*") {
      kind = 2;
      if (i !== segs.length - 1) {
        throw new Error("ch3: * wildcard must be the last path segment");
      }
    } else if (seg.charAt(0) === ":") {
      kind = 1;
      seg = String(seg.slice(1));
      if (seg === "") {
        throw new Error("ch3: empty :param name in " + p);
      }
    }
    let child = -1;
    const ch = nodes[ni].children;
    for (let k = 0; k < ch.length; k++) {
      const c = nodes[ch[k]];
      if (c.kind === kind && c.seg === seg) {
        child = ch[k];
        break;
      }
    }
    if (child < 0) {
      child = newNode(nodes, seg, kind);
      ch.push(child);
    }
    ni = child;
  }
  nodes[ni].hm.push(m);
  nodes[ni].hf.push(hIdx);
}

// Segment bounds inside `path` without materializing a string[] — the
// old matcher split every request's path up front.
function segEndAt(path: string, pos: number, len: number): number {
  for (let i = pos; i < len; i++) {
    if (path.charCodeAt(i) === 47) {
      return i;
    }
  }
  return len;
}

function segEq(path: string, pos: number, end: number, seg: string): boolean {
  const s = String(seg);
  if (end - pos !== s.length) {
    return false;
  }
  for (let i = 0; i < s.length; i++) {
    if (path.charCodeAt(pos + i) !== s.charCodeAt(i)) {
      return false;
    }
  }
  return true;
}

// Zero-allocation match over the raw path. Depth-first over an explicit
// frame stack (no recursion — recursive calls monomorphize an unknown
// instantiation). Children are pushed wildcard → param → static so static
// pops first, matching the previous matcher's priority. Params are NOT
// extracted here — values are materialized lazily by ReqView from the
// matched entry's declared positions.
function matchPath(nodes: RouteNode[], path: string): RouteNode | null {
  const p = String(path);
  const len = p.length;
  let node = nodes[0];
  let pos = 1;
  // Zero-alloc static descent: advance only while every level resolves to
  // an exact static child; a param/wildcard sibling or a miss hands off
  // to the DFS below.
  let dive = pos <= len;
  while (dive) {
    const end = segEndAt(p, pos, len);
    const ch = node.children;
    let next = -1;
    let alt = false;
    for (let k = 0; k < ch.length; k++) {
      const c = nodes[ch[k]];
      if (c.kind === 0) {
        if (segEq(p, pos, end, c.seg)) {
          next = ch[k];
        }
      } else {
        alt = true;
      }
    }
    if (alt || next < 0) {
      dive = false;
    } else {
      node = nodes[next];
      pos = end + 1;
      dive = pos <= len;
    }
  }
  if (pos > len && node.hf.length > 0) {
    return node;
  }
  const stack: Frame[] = [];
  stack.push({ node: node, pos: pos });
  while (stack.length > 0) {
    const f = stack[stack.length - 1];
    stack.pop();
    const fnode = f.node;
    const fpos = f.pos;
    if (fpos > len) {
      if (fnode.hf.length > 0) {
        return fnode;
      }
      continue;
    }
    const end = segEndAt(p, fpos, len);
    const ch = fnode.children;
    for (let k = ch.length - 1; k >= 0; k--) {
      const c = nodes[ch[k]];
      if (c.kind === 2) {
        stack.push({ node: c, pos: len + 1 });
      }
    }
    for (let k = ch.length - 1; k >= 0; k--) {
      const c = nodes[ch[k]];
      if (c.kind === 1) {
        stack.push({ node: c, pos: end + 1 });
      }
    }
    for (let k = ch.length - 1; k >= 0; k--) {
      const c = nodes[ch[k]];
      if (c.kind === 0 && segEq(p, fpos, end, c.seg)) {
        stack.push({ node: c, pos: end + 1 });
      }
    }
  }
  return null;
}

function findEntry(node: RouteNode, method: string): number {
  const m = String(method);
  const hm = node.hm;
  let star = -1;
  for (let i = 0; i < hm.length; i++) {
    if (hm[i] === m) {
      return i;
    }
    if (hm[i] === "*" && star < 0) {
      star = i;
    }
  }
  if (star >= 0) {
    return star;
  }
  if (m === "HEAD") {
    for (let i = 0; i < hm.length; i++) {
      if (hm[i] === "GET") {
        return i;
      }
    }
  }
  return -1;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function defaultNotFound(c: Ctx): void {
  c.status(404);
  c.text("Not Found");
}

// Contract helpers for generated dispatch modules (docs/route-contract.md):
// _guard runs a synchronous handler body under the standard 500 path;
// _buffer attaches data/end listeners, buffers the body, then runs k under
// the same guard. The internal dispatch inlines the equivalent flow so the
// hot path never pays a closure it doesn't need.
export function _guard(res: ServerResponse, k: () => void): void {
  try {
    k();
  } catch (e) {
    send500(res);
  }
}

export function _buffer(req: IncomingMessage, res: ServerResponse, c: Ctx, k: () => void): void {
  const rv = c.req;
  let buf = "";
  req.on("data", function (chunk: Buffer): void {
    buf = buf + chunk.toString();
  });
  req.on("end", function (): void {
    rv._setBody(buf);
    _guard(res, k);
  });
}

// 405 Method Not Allowed with an Allow header built from the matched
// node's registered methods. `*` (all) expands to every standard verb so
// the header stays spec-true; GET implies HEAD.
function allow405(
  node: RouteNode,
  req: IncomingMessage,
  res: ServerResponse,
  oef: ((err: unknown, c: Ctx) => void) | null,
): void {
  const hm = node.hm;
  const seen: { [k: string]: number } = {};
  const out: string[] = [];
  for (let i = 0; i < hm.length; i++) {
    let m = String(hm[i]);
    if (m === "*") {
      m = "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS";
    } else if (m === "GET" && seen["HEAD"] === undefined) {
      // GET implies HEAD; both names end up in the header
      if (seen["GET"] === undefined) {
        seen["GET"] = 1;
        out.push("GET");
      }
      m = "HEAD";
    }
    if (seen[m] === undefined) {
      seen[m] = 1;
      out.push(m);
    }
  }
  if (oef !== null) {
    // The synthetic Ctx wraps the REAL request (path/qs from its url) so an
    // onError handler can inspect it; params are unbound (no match was
    // made for this method) and body is ''. scriptc rejects constructing
    // external classes or widened literals, so no placeholder object here.
    const url = String(req.url || "/");
    let path = url;
    let qs = "";
    const qi = url.indexOf("?");
    if (qi >= 0) {
      path = String(url.slice(0, qi));
      qs = String(url.slice(qi + 1));
    }
    oef(new MethodNotAllowedError(out.join(",")), new Ctx(new ReqView(req, qs, path), res));
    if (res.headersSent) {
      return;
    }
  }
  try {
    res.statusCode = 405;
    res.setHeader("allow", out.join(", "));
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.setHeader("content-length", "18");
    res.end("Method Not Allowed");
  } catch (e) {
    try {
      res.destroy();
    } catch (e2) {
      // socket already gone
    }
  }
}

class MethodNotAllowedError extends Error {
  allow: string;
  constructor(allow: string) {
    super("Method Not Allowed");
    this.name = "MethodNotAllowedError";
    this.allow = String(allow);
  }
}

function send500(res: ServerResponse): void {
  try {
    if (res.headersSent) {
      res.destroy();
    } else {
      res.statusCode = 500;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.setHeader("content-length", "21");
      res.end("Internal Server Error");
    }
  } catch (e) {
    try {
      res.destroy();
    } catch (e2) {
      // socket already gone
    }
  }
}

function utf8len(s: string): number {
  const b = String(s);
  let n = 0;
  for (let i = 0; i < b.length; i++) {
    const c = b.charCodeAt(i);
    if (c < 0x80) {
      n = n + 1;
    } else if (c < 0x800) {
      n = n + 2;
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < b.length) {
      const c2 = b.charCodeAt(i + 1);
      if (c2 >= 0xdc00 && c2 <= 0xdfff) {
        n = n + 4;
        i = i + 1;
      } else {
        n = n + 3;
      }
    } else {
      n = n + 3;
    }
  }
  return n;
}

export function dec(s: string): string {
  const t = String(s).split("+").join(" ");
  try {
    return decodeURIComponent(t);
  } catch (e) {
    return t;
  }
}

function copyMw(mw: Middleware[]): Middleware[] {
  const out: Middleware[] = [];
  for (let i = 0; i < mw.length; i++) {
    out.push(mw[i]);
  }
  return out;
}

// Middleware flattened per route at registration: mw[..] + handler compose
// into ONE Handler, so dispatch makes a single call with zero per-request
// closures (the previous `_chain` cursor allocated one closure per mw per
// request). Linear semantics are identical: next() resumes the tail, and a
// mw calling next() twice re-runs the tail twice — same as the cursor.
// Wrappers return fn(c, next) so an async tail's promise propagates to
// dispatch's thenable check. Sync fast path: one return slot + one branch
// per layer, zero microtask ticks.
function compose(mw: Middleware[], h: Handler): Handler {
  let chain: Handler = h;
  for (let i = mw.length - 1; i >= 0; i--) {
    const fn = mw[i];
    const inner = chain;
    chain = function (c: Ctx): void | Promise<void> {
      return fn(c, function (): void | Promise<void> {
        return inner(c);
      });
    };
  }
  return chain;
}

function mergeMw(a: Middleware[], b: Middleware[]): Middleware[] {
  const out: Middleware[] = [];
  for (let i = 0; i < a.length; i++) {
    out.push(a[i]);
  }
  for (let i = 0; i < b.length; i++) {
    out.push(b[i]);
  }
  return out;
}

// Registration-time route metadata: declared param positions in the
// pattern. Dispatch binds these to ReqView so params materialize lazily
// (never touched for routes whose handlers don't read params).
interface PathMeta {
  names: string[];
  idxs: number[];
  splat: number;
}

function pathMeta(path: string): PathMeta {
  const names: string[] = [];
  const idxs: number[] = [];
  let splat = -1;
  const segs = String(path).split("/");
  for (let i = 1; i < segs.length; i++) {
    const seg = String(segs[i]);
    if (seg === "*") {
      splat = i;
    } else if (seg.charAt(0) === ":") {
      names.push(String(seg.slice(1)));
      idxs.push(i);
    }
  }
  return { names: names, idxs: idxs, splat: splat };
}

interface MountFrame {
  i: number;
  a: string;
}

function mountRoutes(sub: App, app: App, prefix: string, pre: Middleware[]): void {
  const sn = sub._nodes;
  const stack: MountFrame[] = [{ i: 0, a: "" }];
  while (stack.length > 0) {
    const f = stack[stack.length - 1];
    stack.pop();
    const n = sn[f.i];
    const a = String(f.a);
    const hs = n.hf;
    if (hs.length > 0) {
      let path = String(prefix) + a;
      if (path === "") {
        path = "/";
      }
      for (let i = 0; i < hs.length; i++) {
        const subMw = sub._mws[hs[i]];
        const idx = app._regFn(
          sub._fns[hs[i]],
          mergeMw(pre, subMw),
          pathMeta(path),
          sub._bodyF[hs[i]],
        );
        addRoute(app._nodes, n.hm[i], path, idx);
      }
    }
    const ch = n.children;
    for (let i = 0; i < ch.length; i++) {
      const c = sn[ch[i]];
      let seg = String(c.seg);
      if (c.kind === 1) {
        seg = ":" + seg;
      }
      stack.push({ i: ch[i], a: a + "/" + seg });
    }
  }
}

export class App {
  _nodes: RouteNode[];
  _mw: Middleware[];
  _fns: Handler[];
  // _mws[i] is the middleware snapshot for handler _fns[i] — kept on the
  // class, not in RouteNode records, because function-array record members
  // are rejected under eager program-code instantiation (SC2009).
  _mws: Middleware[][];
  _nf: Handler;
  _nfmw: Middleware[];
  // onError handler: (err, c) => void. null = unset (default send500 path).
  _oef: ((err: unknown, c: Ctx) => void) | null;
  // _chains[i] is _mws[i] + _fns[i] flattened into one Handler — dispatch
  // calls it directly; there is no runtime chain walker.
  _chains: Handler[];
  _nfchain: Handler;
  // Per-entry route metadata (parallel to _fns): declared param positions
  // for lazy materialization and the `body: true` declaration flag.
  _pn: string[][];
  _pi: number[][];
  _sp: number[];
  _bodyF: number[];
  // Generated-dispatch seam (docs/route-contract.md): a plain function
  // field, not an interface-typed field — an interface with a method member
  // would fence eager program-code instantiation the same way a function
  // inside a record does. Default returns false (never registered).
  _gen: DispatchFn;

  constructor() {
    this._nodes = [];
    newNode(this._nodes, "", 0);
    this._mw = [];
    this._fns = [];
    this._mws = [];
    this._nf = defaultNotFound;
    this._nfmw = [];
    this._oef = null;
    this._chains = [];
    this._nfchain = defaultNotFound;
    this._pn = [];
    this._pi = [];
    this._sp = [];
    this._bodyF = [];
    this._gen = function (_r: IncomingMessage, _s: ServerResponse): boolean {
      return false;
    };
  }

  // Verb methods take `path: string` + `Ctx`, not `<P extends string>`:
  // a value parameter typed by a type parameter cannot compile under
  // eager program-code instantiation (SC2001). The generic rode along
  // for literal-param inference, but param() is string-typed regardless
  // — no type-safety is lost. `opts.body` declares body use; without it
  // c.req.body() returns '' (docs/route-contract.md).
  get(path: string, h: (c: Ctx) => void, opts?: RouteOpts): App {
    return this._add("GET", path, h as unknown as Handler, bodyFlag(opts));
  }

  post(path: string, h: (c: Ctx) => void, opts?: RouteOpts): App {
    return this._add("POST", path, h as unknown as Handler, bodyFlag(opts));
  }

  put(path: string, h: (c: Ctx) => void, opts?: RouteOpts): App {
    return this._add("PUT", path, h as unknown as Handler, bodyFlag(opts));
  }

  delete(path: string, h: (c: Ctx) => void, opts?: RouteOpts): App {
    return this._add("DELETE", path, h as unknown as Handler, bodyFlag(opts));
  }

  patch(path: string, h: (c: Ctx) => void, opts?: RouteOpts): App {
    return this._add("PATCH", path, h as unknown as Handler, bodyFlag(opts));
  }

  head(path: string, h: (c: Ctx) => void, opts?: RouteOpts): App {
    return this._add("HEAD", path, h as unknown as Handler, bodyFlag(opts));
  }

  options(path: string, h: (c: Ctx) => void, opts?: RouteOpts): App {
    return this._add("OPTIONS", path, h as unknown as Handler, bodyFlag(opts));
  }

  all(path: string, h: (c: Ctx) => void, opts?: RouteOpts): App {
    return this._add("*", path, h as unknown as Handler, bodyFlag(opts));
  }

  on(method: string, path: string, h: (c: Ctx) => void, opts?: RouteOpts): App {
    return this._add(String(method).toUpperCase(), path, h as unknown as Handler, bodyFlag(opts));
  }

  use(fn: Middleware): App {
    this._mw.push(fn);
    return this;
  }

  notFound(h: (c: Ctx) => void): App {
    this._nf = h as unknown as Handler;
    this._nfmw = copyMw(this._mw);
    this._nfchain = compose(this._nfmw, this._nf);
    return this;
  }

  // Single catch-all around the whole chain. Honored by both dispatch
  // paths (immediate + buffered-body). Rethrow/throw inside the handler
  // falls back to the built-in 500 — onError must not loop.
  onError(h: (err: unknown, c: Ctx) => void): App {
    this._oef = h;
    return this;
  }

  route(prefix: string, sub: App): App {
    let p = String(prefix);
    if (p.length > 1 && p.charAt(p.length - 1) === "/") {
      p = String(p.slice(0, p.length - 1));
    }
    mountRoutes(sub, this, p, copyMw(this._mw));
    return this;
  }

  // Registers a generated dispatch module (docs/route-contract.md). The
  // stored field is a closure so `d` only has to satisfy the GenDispatch
  // class shape at the call site — subclasses, duck-typed objects, and the
  // emitted `class X extends GenDispatch` all work.
  withDispatch(d: GenDispatch): App {
    const g = d;
    this._gen = function (rq: IncomingMessage, rs: ServerResponse): boolean {
      return g.dispatch(rq, rs);
    };
    return this;
  }

  handler(): (req: IncomingMessage, res: ServerResponse) => void {
    const app = this;
    return function (req: IncomingMessage, res: ServerResponse): void {
      app._dispatch(req, res);
    };
  }

  serve(opts: { port: number }): Server;
  serve(opts: { port: number; host: string }): Server;
  serve(opts: { port: number; host?: string }): Server {
    const s = http.createServer(this.handler());
    if (opts.host === null || opts.host === undefined) {
      s.listen(Number(opts.port));
    } else {
      s.listen(Number(opts.port), String(opts.host));
    }
    return s;
  }

  _regFn(h: Handler, mw: Middleware[], m: PathMeta, body: number): number {
    this._fns.push(h);
    this._mws.push(mw);
    this._chains.push(compose(mw, h));
    this._pn.push(m.names);
    this._pi.push(m.idxs);
    this._sp.push(m.splat);
    this._bodyF.push(body);
    return this._fns.length - 1;
  }

  _add(method: string, path: string, h: Handler, body: number): App {
    const idx = this._regFn(h, copyMw(this._mw), pathMeta(path), body);
    addRoute(this._nodes, method, path, idx);
    return this;
  }

  _dispatch(req: IncomingMessage, res: ServerResponse): void {
    if (this._gen(req, res)) {
      return;
    }
    const oef = this._oef;
    const method: string = String(req.method || "");
    const url: string = String(req.url || "/");
    let path = url;
    let qs = "";
    const qi = url.indexOf("?");
    if (qi >= 0) {
      path = String(url.slice(0, qi));
      qs = String(url.slice(qi + 1));
    }
    const node = matchPath(this._nodes, path);
    let chain = this._nfchain;
    let body = 0;
    let idx = -1;
    if (node !== null) {
      const j = findEntry(node, method);
      if (j >= 0) {
        idx = node.hf[j];
        chain = this._chains[idx];
        body = this._bodyF[idx];
      } else if (node.hf.length > 0) {
        // Path matched, method didn't: 405 + Allow from the node's method
        // table (computed only on this miss path — zero hot-path cost).
        allow405(node, req, res, oef);
        return;
      }
    }
    const rv = new ReqView(req, qs, path);
    if (idx >= 0) {
      rv._pn = this._pn[idx];
      rv._pi = this._pi[idx];
      rv._sp = this._sp[idx];
    }
    const c = new Ctx(rv, res);
    if (
      body === 1 &&
      (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE")
    ) {
      let buf = "";
      req.on("data", function (chunk: Buffer): void {
        buf = buf + chunk.toString();
      });
      req.on("end", function (): void {
        rv._setBody(buf);
        try {
          const r = chain(c);
          if (r !== null && r !== undefined && typeof r.then === "function") {
            r.then(
              function (): void {
                if (c.sent === false && res.headersSent === false) {
                  send500(res);
                }
              },
              function (e: unknown): void {
                if (oef !== null) {
                  runOnError(oef, e, res, c);
                } else {
                  send500(res);
                }
              },
            );
          } else if (c.sent === false && res.headersSent === false) {
            send500(res);
          }
        } catch (e) {
          if (oef !== null) {
            runOnError(oef, e, res, c);
          } else {
            send500(res);
          }
        }
      });
    } else {
      try {
        const r = chain(c);
        if (r !== null && r !== undefined && typeof r.then === "function") {
          r.then(
            function (): void {
              if (c.sent === false && res.headersSent === false) {
                send500(res);
              }
            },
            function (e: unknown): void {
              if (oef !== null) {
                runOnError(oef, e, res, c);
              } else {
                send500(res);
              }
            },
          );
        } else if (c.sent === false && res.headersSent === false) {
          send500(res);
        }
      } catch (e) {
        if (oef !== null) {
          runOnError(oef, e, res, c);
        } else {
          send500(res);
        }
      }
    }
  }
}

// Run the user onError handler; anything it throws (or a response it never
// writes) falls back to the built-in 500 path so the socket always gets
// exactly one terminal outcome.
function runOnError(
  oef: (err: unknown, c: Ctx) => void,
  e: unknown,
  res: ServerResponse,
  c: Ctx,
): void {
  try {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    oef(e, c);
    if (!c.sent) {
      send500(res);
    }
  } catch (e2) {
    if (!res.headersSent) {
      send500(res);
    } else {
      try {
        res.destroy();
      } catch (e3) {
        // socket already gone
      }
    }
  }
}

export function createRouter(): App {
  return new App();
}
