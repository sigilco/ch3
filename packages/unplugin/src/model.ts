// Shared model between extract.ts (AST -> routes) and emit.ts (routes -> code).

import type { Expression } from "./parse/index.ts";

export interface SegSpec {
  // 0 static, 1 :param, 2 tail-* wildcard — mirrors chttp's RouteNode.kind
  kind: number;
  lit: string; // static segment text, or param name, or '*' for wildcards
}

export interface StaticSend {
  // Handler is a pure send-chain on `c` with compile-time-literal args
  // (c.status(N).header(k, v).json|text|html(lit) or c.redirect(url[, code])).
  // The generated runner writes the response directly — no Ctx allocation.
  status: number;
  headers: string[][]; // [k, v] pairs from c.header(...) calls, in order
  contentType: string; // '' for redirect
  body: string; // '' for redirect
  location: string; // '' unless redirect
}

export interface RouteSpec {
  method: string; // 'GET' | 'POST' | ... | '*'
  path: string; // canonical registration pattern e.g. '/user/:id'
  segs: SegSpec[]; // path segments (leading '' segment of split('/') omitted)
  handlerIdx: number; // index into App._fns, or -1 when unknown (post-uncertainty)
  handlerNode?: Expression; // inline handler AST (for specialization)
  hasMw: boolean; // middleware snapshot may be non-empty
  mwUnsafe: boolean; // a nested use() makes the snapshot uncertain — no specialization
  declaredBody: boolean; // `{ body: true }` at registration (declared-body rule)
  needsBody: boolean; // declaredBody && not static-specialized → runner uses _buffer
  staticSend: StaticSend | null;
  registered: number; // emission ordinal == App._fns order (sort tiebreak)
  emit: boolean; // a dispatch check is generated for this route
  bailReason: string; // '' when emitted; else why it was left to the runtime path
}

export interface AppBinding {
  varName: string; // source-level router variable name
  importKind: string; // 'named' | 'default' — how routes.gen.ts imports it
  exportName: string; // exported binding name for named imports
}

export interface ModuleModel {
  fileName: string;
  app: AppBinding | null; // null → no exported router → stub gen file
  routes: RouteSpec[];
  warnings: string[];
  fatal: string; // non-'': module cannot be lowered (emit stub with this reason)
  // OpenAPI side channel (openapi: true): per-route schema evidence found in
  // the handler AST, consumed by openapi.ts when emitting routes.openapi.ts.
  // Always [] when the openapi option is off — detection never runs.
  openapi: RouteOpenApi[];
  // Detection warnings surfaced only when openapi emit runs (a route whose
  // val schema could not be proven is documented without it, warned, never
  // guessed). Kept separate from `warnings` so route lowering output stays
  // byte-identical with and without the option.
  openapiWarnings: string[];
  // Every module-level const the extractor proved printable, in declaration
  // order (empty when the openapi option is off). Evidence `deps` name into
  // this table; the emitter emits only the closure actually referenced.
  openapiConsts: OpenApiConst[];
}

// Where a `v.parse(schema, <request view>)` call inside a handler binds.
// Exactly one of body/query/params per detected call; a route may show more
// than one.
export type OpenApiTarget = "body" | "query" | "params";

// A module-level const the extractor proved to be a printable val schema
// expression. Emitted once per routes.openapi.ts (deduped by usage), in
// declaration order — which is a valid dependency order, since a same-file
// const can only reference consts declared before it (TDZ).
export interface OpenApiConst {
  name: string; // source-level const name
  emitted: string; // collision-proof emitted local name (see openapi.ts)
  src: string; // initializer printed as TS source, emitted verbatim
  deps: string[]; // source names of consts this initializer references
}

export interface RouteOpenApi {
  method: string; // route method, '*' for app.all
  path: string; // canonical registration pattern e.g. '/user/:id'
  target: OpenApiTarget;
  // Specifier the routes module used for '@chttp/val' ('@chttp/val', a
  // workspace-relative source path, ...). The emitted openapi module imports
  // toOpenApiSchema through the SAME specifier, so both stay one graph.
  valSpecifier: string;
  // Printable TS source text of the schema expression — a re-declaration of
  // the val factory calls the extractor proved, or null when this entry only
  // proves the val import (bail evidence, never emitted as a schema).
  schemaSrc: string | null;
  // Full dependency closure of schemaSrc over module-level schema consts
  // (source names). The emitter declares each of these, once, before the
  // schema that references them; openapiConsts supplies name/src/deps.
  deps: string[];
}

export const ROUTE_METHODS: { [k: string]: string } = {
  get: "GET",
  post: "POST",
  put: "PUT",
  delete: "DELETE",
  patch: "PATCH",
  head: "HEAD",
  options: "OPTIONS",
  all: "*",
};

export const METHOD_ORDER: { [k: string]: number } = {
  GET: 0,
  HEAD: 1,
  POST: 2,
  PUT: 3,
  PATCH: 4,
  DELETE: 5,
  OPTIONS: 6,
};

export const WRITE_METHODS: { [k: string]: boolean } = {
  POST: true,
  PUT: true,
  PATCH: true,
  DELETE: true,
};
