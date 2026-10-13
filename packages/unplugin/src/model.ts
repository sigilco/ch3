// Shared model between extract.ts (AST -> routes) and emit.ts (routes -> code).

import type { Expression } from "./parse/index.ts";

export interface SegSpec {
  // 0 static, 1 :param, 2 tail-* wildcard — mirrors ch3's RouteNode.kind
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
