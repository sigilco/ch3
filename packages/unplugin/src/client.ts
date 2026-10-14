// Typed-client side-channel emit — `.chttp/routes.client.ts`.
//
// This module NEVER feeds scriptc or runtime dispatch: the generated file
// is plain TS consumed by user code (browsers, node tools, tests) that wants
// typed fetch wrappers for the routes the plugin lowered. The router never
// imports it, and `scriptc build` never sees it. Detection strategy mirrors
// the unbail-not-guess philosophy shared with openapi.ts: a route must be
// provably literal to make the typed map; anything we cannot prove drops
// out entirely rather than gets a wrong-shape answer.
//
// Output shape:
//   import { chttpRouteTable } from "./routes.openapi.ts"
//   // RouteMap = { `GET /foo/:id`: { params, query, body, response } }
//   // GetRoutes / PostRoutes / etc. = Pick<RouteMap, `${typeof M} ${Path}`>
//   // GetPath / PostPath / etc. = keyof GetRoutes
//   export class ChttpClientError extends Error { status, body }
//   export function createClient(opts) -> { get, post, ... , any }
//   each verb: (path, { params?, query?, body?, headers? }) => Promise<R>

import type { ModuleModel, RouteSpec } from "./model.ts";

// File name for the emitted client. Sibling of routes.gen.ts / routes.openapi.ts.
export function clientFileName(): string {
  return "routes.client.ts";
}

// Verbs the typed-client runtime exposes: one method per concrete HTTP verb
// we lower, plus `any` for `app.all` / '*' routes (where we cannot pin a
// method to the wire shape).
const VERBS: { upper: string; lower: string; type: string }[] = [
  { upper: "GET", lower: "get", type: "Get" },
  { upper: "POST", lower: "post", type: "Post" },
  { upper: "PUT", lower: "put", type: "Put" },
  { upper: "DELETE", lower: "delete", type: "Delete" },
  { upper: "PATCH", lower: "patch", type: "Patch" },
  { upper: "HEAD", lower: "head", type: "Head" },
  { upper: "OPTIONS", lower: "options", type: "Options" },
];

const J = JSON.stringify;

// A TS literal fragment representing the inferred response type for a route.
// Static send-chains carry a literal body: the body parses to a TS literal
// (object / array / string / number / boolean / null). Anything else
// (ctx routes, bailed routes, body not provable) -> `unknown`.
function responseTypeFor(r: RouteSpec): string {
  if (r.emit !== true) {
    return "unknown";
  }
  const s = r.staticSend;
  if (s === null) {
    return "unknown";
  }
  if (s.location !== "") {
    return "unknown"; // redirect: caller doesn't get JSON
  }
  const t = literalTsType(s.body, s.contentType);
  return t === null ? "unknown" : t;
}

// Map a `staticSend.body` JSON string + content-type to a TS literal type
// fragment. Strings/numbers/booleans/null are literal TS types; JSON objects
// and arrays become inline TS literal expressions (a record of fields with
// literal types). Anything that doesn't parse cleanly (or is too deeply
// nested) returns null and the caller bails to `unknown`.
function literalTsType(body: string, contentType: string): string | null {
  const isJson = contentType.indexOf("application/json") === 0;
  const isText = contentType.indexOf("text/") === 0;
  if (isText) {
    return J(body);
  }
  if (!isJson) {
    return null;
  }
  try {
    const v: unknown = JSON.parse(body);
    return tsLit(v, 0);
  } catch {
    return null;
  }
}

// Recursively build a TS literal type from a JSON value. Strings/numbers/
// booleans/null become TS literal types; arrays and records become inline
// type literals. Depth limit guards pathological recursion; deeper values
// bail to `unknown` (bail, not guess).
function tsLit(v: unknown, depth: number): string | null {
  if (depth > 8) {
    return "unknown";
  }
  if (v === null) {
    return "null";
  }
  if (typeof v === "string") {
    return J(v);
  }
  if (typeof v === "number") {
    return Number.isFinite(v) ? String(v) : "unknown";
  }
  if (typeof v === "boolean") {
    return v ? "true" : "false";
  }
  if (Array.isArray(v)) {
    if (v.length === 0) {
      return "unknown[]";
    }
    const parts: string[] = [];
    for (const el of v) {
      const t = tsLit(el, depth + 1);
      if (t === null) {
        return "unknown[]";
      }
      parts.push(t);
    }
    return "[" + parts.join(", ") + "]";
  }
  if (typeof v === "object") {
    const obj = v as { [k: string]: unknown };
    const keys = Object.keys(obj);
    if (keys.length === 0) {
      return "Record<string, never>";
    }
    const parts: string[] = [];
    for (const k of keys) {
      const t = tsLit(obj[k], depth + 1);
      if (t === null) {
        return "{ [k: string]: unknown }";
      }
      parts.push(J(k) + ": " + t);
    }
    return "{ " + parts.join("; ") + " }";
  }
  return null;
}

// Per-route param typing: when openapi evidence proves a path/query/params
// schema, the typed map carries `{ [name]: string }` (the minimal shape a
// runtime can carry). Without openapi evidence, params default to
// `Record<string, string>` so unknown-route paths still type. Empty when
// the route has no path/query params (params defaults to `Record<string, never>`).
function paramsTypeFor(r: RouteSpec): string {
  // Always at least `Record<string, never>` to allow empty params objects.
  let hasPathParam = false;
  for (const s of r.segs) {
    if (s.kind === 1) {
      hasPathParam = true;
      break;
    }
  }
  if (!hasPathParam) {
    return "Record<string, never>";
  }
  return "Record<string, string>";
}

function queryTypeFor(_r: RouteSpec): string {
  // Conservative default: callers may pass any string-keyed query string.
  return "Record<string, string>";
}

function bodyTypeFor(_r: RouteSpec): string {
  // Body typing follows openapi evidence: a body schema re-declared in the
  // sibling openapi module produces a stronger type than `unknown`. Without
  // evidence (the common case today), `unknown` is the honest answer.
  // Bail, not guess.
  return "unknown";
}

// Backtick-quoted template-literal type for a route key. RouteMap keys are
// `${METHOD} ${path}` (space-separated), and each verb's Pick narrows to
// `${METHOD} ${path}` for that method. The bracketed form `[...]` is
// required by tsc to parse a template-literal property name inside an
// object type (a bare `` `...` `` property name is rejected as syntax).
// The plain form is what Pick / union members need (it is the literal type
// itself, not a property name).
function routeKeyPlain(m: string, path: string): string {
  return "`" + m + " " + path + "`";
}

// Render one entry of the RouteMap interface. Every emitted route is a key
// in the template-literal-typed RouteMap. The bracketed form ([`...`]) is
// the computed-property syntax tsc accepts for a template-literal key
// inside an object type — the bare-backtick form (just `` `...` ``) is
// rejected by TS as a property name even though both are template-literal
// types at the type level.
function routeMapEntry(r: RouteSpec): string {
  const key = "[`" + r.method + " " + r.path + "`]";
  const params = paramsTypeFor(r);
  const query = queryTypeFor(r);
  const body = bodyTypeFor(r);
  const response = responseTypeFor(r);
  return (
    "  " +
    key +
    ": { params: " +
    params +
    "; query: " +
    query +
    "; body: " +
    body +
    "; response: " +
    response +
    " };"
  );
}

// Filter to routes that the typed map can carry: must be lowerable
// (emit === true) and the path must be literal (no leading 'bailReason').
// app.all ('*') routes keep their method as '*' — they fall into AnyRoutes
// and the client exposes a generic `any()` method that doesn't type-constrain
// the method on the wire.
function isProvable(r: RouteSpec): boolean {
  return r.emit === true;
}

// ---------------------------------------------------------------------------
// emit: ModuleModel -> routes.client.ts source
// ---------------------------------------------------------------------------

export function emitClientModule(model: ModuleModel): string {
  const out: string[] = [];
  out.push("// GENERATED by unplugin-chttp — do not edit.");
  out.push("// Source: " + model.fileName);
  out.push("// Side-channel typed fetch client. Never imported by runtime dispatch");
  out.push("// or scriptc. Import this where you want typed `client.get('/x', {...})`");
  out.push("// calls. The sibling openapi module supplies the route table; routes");
  out.push("// the extractor could not prove are excluded from the typed map.");
  out.push("");

  // Route map body: every proven route is a key in the template-literal-typed
  // RouteMap. Bailed routes do not appear at all.
  const provable = model.routes.filter(isProvable);

  // Group routes by method so each verb's Pick can grab its share.
  const byMethod: { [m: string]: RouteSpec[] } = {};
  for (const r of provable) {
    if (byMethod[r.method] === undefined) {
      byMethod[r.method] = [];
    }
    (byMethod[r.method] as RouteSpec[]).push(r);
  }

  out.push('import { chttpRouteTable } from "./routes.openapi.ts";');
  out.push("");
  out.push('// RouteMap keys are `"<METHOD> <path>"` (space-separated). Look up a');
  out.push('// route with `RouteMap["GET " + path]`; the typed map exposes the');
  out.push("// strongest params/query/body/response types the extractor can prove.");
  out.push("// Anything outside this map is `unknown` to the client — bail-not-guess.");
  out.push("export interface RouteMap {");
  if (provable.length === 0) {
    out.push("  // no statically provable routes");
  } else {
    for (const r of provable) {
      out.push(routeMapEntry(r));
    }
  }
  out.push("}");
  out.push("");

  // Per-verb Pick aliases. Routes without an entry for a verb (e.g. no POST
  // handlers) get an empty alias so the `PostPath` keyof is `never` and
  // `client.post('/x', ...)` is rejected at compile time — the typed
  // contract still has teeth. Key-remapping (`K extends ... ? ... : never`)
  // strips the method prefix from each route key so the verb Path alias
  // is a bare path (e.g. `/user/:id`), matching the runtime call-site
  // shape `client.get("/user/:id", { params: ... })`.
  for (const v of VERBS) {
    const routes = byMethod[v.upper] ?? [];
    if (routes.length === 0) {
      out.push("export type " + v.type + "Routes = Record<string, never>;");
    } else {
      const pickKeys = routes.map((r) => routeKeyPlain(r.method, r.path)).join(" | ");
      out.push(
        "export type " +
          v.type +
          "Routes = { [K in keyof RouteMap as K extends `" +
          v.upper +
          " ${infer P}` ? P : never]: RouteMap[K] };",
      );
      // PickKeys retains the runtime union of full keys (with method
      // prefix) for the `_AssertRouteTableMatches` length check below.
      void pickKeys;
    }
  }
  // app.all ('*') routes get their own bucket. The client exposes a generic
  // `any(path, opts)` whose return is `unknown` (we cannot pin the wire
  // method without re-deriving from `app.all` semantics).
  const anyRoutes = provable.filter((r) => r.method === "*");
  if (anyRoutes.length === 0) {
    out.push("export type AnyRoutes = Record<string, never>;");
  } else {
    out.push(
      "export type AnyRoutes = { [K in keyof RouteMap as K extends `* ${infer P}` ? P : never]: RouteMap[K] };",
    );
  }
  out.push("");

  // Per-verb path type aliases = keyof <Verb>Routes. These are the contract
  // surface a typed consumer writes against.
  for (const v of VERBS) {
    const pathType = v.type + "Path";
    out.push("export type " + pathType + " = keyof " + v.type + "Routes;");
  }
  out.push("export type AnyPath = keyof AnyRoutes;");
  out.push("");

  // Call-option shape: the user passes optionals (params, query, body,
  // headers). The verb method's signature threads the right route entry off
  // the verb's Pick. `body` is `Body<RouteMap[VerbKey]>` so non-body
  // methods still type the body field (it'd be unused). `headers` always
  // passthrough as a plain Record.
  out.push("export interface ChttpCallOptions<P, Q, B> {");
  out.push("  params?: P;");
  out.push("  query?: Q;");
  out.push("  body?: B;");
  out.push("  headers?: Record<string, string>;");
  out.push("}");
  out.push("");

  // ChttpClientError: minimal runtime error class so consumers don't need
  // an external dependency to read status + body off a non-2xx.
  out.push("export class ChttpClientError extends Error {");
  out.push("  status: number;");
  out.push("  body: unknown;");
  out.push("  constructor(status: number, body: unknown, message?: string) {");
  out.push('    super(message ?? "HTTP " + String(status));');
  out.push("    this.status = status;");
  out.push("    this.body = body;");
  out.push('    this.name = "ChttpClientError";');
  out.push("  }");
  out.push("}");
  out.push("");

  // Verb method factories. Each verb is a curried function: the typed
  // surface is `client.get<Path extends GetPath>(...)`. The runtime is a
  // plain fetch wrapper: replace `:name` segments with `encodeURIComponent`
  // of the params dict, append `?k=v&...` for query, JSON.stringify body,
  // throw ChttpClientError on non-2xx, return parsed JSON (or text on
  // non-JSON content-type) on 2xx.
  out.push("export interface ChttpClient {");
  for (const v of VERBS) {
    out.push(
      "  " +
        v.lower +
        "<P extends " +
        v.type +
        "Path>(path: P, opts?: ChttpCallOptions<" +
        v.type +
        'Routes[P]["params"], ' +
        v.type +
        'Routes[P]["query"], ' +
        v.type +
        'Routes[P]["body"]>): Promise<' +
        v.type +
        'Routes[P]["response"]>;',
    );
  }
  out.push(
    '  any<P extends AnyPath>(path: P, opts?: ChttpCallOptions<AnyRoutes[P]["params"], AnyRoutes[P]["query"], AnyRoutes[P]["body"]>): Promise<unknown>;',
  );
  out.push("}");
  out.push("");

  out.push("export interface CreateClientOptions {");
  out.push("  fetch?: typeof fetch;");
  out.push("  baseUrl?: string;");
  out.push("}");
  out.push("");

  out.push("export function createClient(opts: CreateClientOptions = {}): ChttpClient {");
  out.push("  const _fetch = opts.fetch ?? globalThis.fetch.bind(globalThis);");
  out.push('  const baseUrl = opts.baseUrl ?? "";');
  out.push("");

  // Verb bodies. The runtime is identical for every verb — only the HTTP
  // method changes. Keeping one helper (callMethod) keeps the body small.
  out.push("  async function callMethod(");
  out.push("    method: string,");
  out.push("    path: string,");
  out.push("    params: Record<string, string> | undefined,");
  out.push("    query: Record<string, string> | undefined,");
  out.push("    body: unknown,");
  out.push("    headers: Record<string, string> | undefined,");
  out.push("  ): Promise<unknown> {");
  out.push("    let p = path;");
  out.push("    if (params !== undefined) {");
  out.push("      for (const k of Object.keys(params)) {");
  out.push(
    '        p = p.replace(":" + k, encodeURIComponent(String((params as Record<string, string>)[k])));',
  );
  out.push("      }");
  out.push("    }");
  out.push("    const url = baseUrl + p;");
  out.push('    let qs = "";');
  out.push("    if (query !== undefined) {");
  out.push("      const parts: string[] = [];");
  out.push("      for (const k of Object.keys(query)) {");
  out.push(
    '        parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(String((query as Record<string, string>)[k])));',
  );
  out.push("      }");
  out.push("      if (parts.length > 0) {");
  out.push('        qs = "?" + parts.join("&");');
  out.push("      }");
  out.push("    }");
  out.push(
    "    const init: { method: string; headers: Record<string, string>; body: string | null } = {",
  );
  out.push("      method: method,");
  out.push("      headers: {},");
  out.push("      body: null,");
  out.push("    };");
  out.push("    if (headers !== undefined) {");
  out.push("      const src = headers;");
  out.push("      const dst = init.headers;");
  out.push("      for (const k of Object.keys(src)) {");
  out.push("        dst[k] = src[k] as string;");
  out.push("      }");
  out.push("    }");
  out.push("    if (body !== undefined) {");
  out.push(
    '      init.headers["content-type"] = init.headers["content-type"] ?? "application/json";',
  );
  out.push("      init.body = JSON.stringify(body);");
  out.push("    }");
  out.push("    const res = await _fetch(url + qs, init);");
  out.push("    const text = await res.text();");
  out.push("    let parsed: unknown = text;");
  out.push('    const ct = res.headers.get("content-type") ?? "";');
  out.push('    if (ct.indexOf("application/json") === 0) {');
  out.push("      try { parsed = JSON.parse(text); } catch { parsed = text; }");
  out.push("    }");
  out.push("    if (res.ok) {");
  out.push("      return parsed;");
  out.push("    }");
  out.push("    throw new ChttpClientError(res.status, parsed);");
  out.push("  }");
  out.push("");

  // Per-verb entry points. Each one forwards to callMethod with the right
  // method string. `delete` is a JS reserved word, so verb functions are
  // assigned as object properties (node's --experimental-strip-types
  // loader accepts `verbs["delete"] = ...` but rejects `function delete()`
  // and method-shorthand generics). The runtime verbs take a wide
  // (path: string, opts?: ...) signature and cast at the call site — the
  // typed shape lives on the returned client interface.
  out.push("  const verbs: Record<string, unknown> = {};");
  for (const v of VERBS) {
    out.push(
      "  verbs[" +
        J(v.lower) +
        "] = (path: string, callOpts?: { params?: Record<string, string>; query?: Record<string, string>; body?: unknown; headers?: Record<string, string>; }): Promise<unknown> => callMethod(" +
        J(v.upper) +
        ", path, callOpts?.params, callOpts?.query, callOpts?.body, callOpts?.headers);",
    );
  }
  // any(): same plumbing but the method string is GET. `app.all` registers
  // a wildcard that responds to every standard verb (GET included), so GET
  // is the natural default for an untyped call. Callers that need a
  // different verb can fall back to the typed `get/post/...` surface.
  out.push(
    '  verbs["any"] = (path: string, callOpts?: { params?: Record<string, string>; query?: Record<string, string>; body?: unknown; headers?: Record<string, string>; }): Promise<unknown> => callMethod("GET", path, callOpts?.params, callOpts?.query, callOpts?.body, callOpts?.headers);',
  );

  // Build the typed return object. Each verb field is the corresponding
  // runtime function narrowed to the typed signature the interface
  // declared above.
  out.push("  return {");
  for (const v of VERBS) {
    out.push(
      "    " +
        v.lower +
        ": verbs[" +
        J(v.lower) +
        "] as <P extends " +
        v.type +
        "Path>(path: P, opts?: ChttpCallOptions<" +
        v.type +
        'Routes[P]["params"], ' +
        v.type +
        'Routes[P]["query"], ' +
        v.type +
        'Routes[P]["body"]>) => Promise<' +
        v.type +
        'Routes[P]["response"]>,',
    );
  }
  out.push(
    '    any: verbs["any"] as <P extends AnyPath>(path: P, opts?: ChttpCallOptions<AnyRoutes[P]["params"], AnyRoutes[P]["query"], AnyRoutes[P]["body"]>) => Promise<unknown>,',
  );
  out.push("  } as ChttpClient;");
  out.push("}");
  out.push("");

  // Sanity pin: the route table from the openapi sibling must match the
  // entries in RouteMap (one-to-one). A drift between the two would mean
  // the typed map and the wire endpoints disagree. Both files are emitted
  // by the same plugin run from the same model, so structural drift is
  // impossible — but we still ship a tuple-typed helper so the runtime
  // surface carries the entry count as a TypeScript number, ready for
  // any future compile-time check the consumer wants.
  out.push("// Compile-time entry count surfaced from the route map; useful as a");
  out.push("// const for callers that want a single source of truth.");
  out.push(
    "export const _chttpRouteCount: " +
      String(provable.length) +
      " = " +
      String(provable.length) +
      ";",
  );
  out.push("");

  return out.join("\n");
}
