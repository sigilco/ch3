// OpenAPI 3.1 side-channel emit — `.chttp/routes.openapi.ts`.
//
// This file NEVER feeds scriptc or runtime dispatch: routes.gen.ts emission
// is untouched by everything here, and the emitted artifact is a plain-TS
// module a docs server (or T3's client) imports when it wants an OpenAPI
// document. The router never imports it.
//
// Detection strategy (bail-not-guess, mirroring extract.ts): the extractor's
// evalLiteral machinery proves compile-time literals — strings, numbers,
// records — by structural recursion over the same-file AST. A val schema is
// a RUNTIME VALUE (`v.object({...})` allocates class instances), so no AST
// evaluator can produce it; the alternative — importing '@chttp/val' inside
// the plugin and re-executing extracted expressions at build time — pins the
// plugin's val to the consumer's and breaks for source-path imports
// (fixtures, vendored copies — the layout this plugin itself recommends for
// scriptc). So detection stays textual and evaluation moves into the emitted
// module: the printer re-declares each proven schema expression as TS source
// (same factory calls, same literals, identifiers renamed onto a fixed
// `val` import), the emitted module imports `toOpenApiSchema` through the
// SAME specifier the routes module used, and calls it at module scope. The
// schema evaluates once, in the consumer's own graph, with the consumer's
// val — correct by construction, never drifting from the val that actually
// validates requests.

import type { ModuleModel, OpenApiConst } from "./model.ts";
import type { Expression, Node, Parser } from "./parse/index.ts";

const J = JSON.stringify;

export interface OpenApiEmitOptions {
  // module `info` fields; title defaults to the routes module basename.
  title: string;
  version: string;
}

// One artifact per routes module, sibling of routes.gen.ts. The gen file
// name varies per module stem; the openapi file is the canonical entry
// consumers import, so its name is fixed.
export function openApiFileName(): string {
  return "routes.openapi.ts";
}

// ---------------------------------------------------------------------------
// schema-expression printing: AST -> TS source text
// ---------------------------------------------------------------------------

// The set of member names reachable on a val namespace import that make
// sense inside a schema expression. Everything else on `val.` (parse,
// safeParse, summarize, VError, ...) is not a schema factory and bails.
const VAL_FACTORIES: { [name: string]: boolean } = {
  any: true,
  array: true,
  boolean: true,
  custom: true,
  digits: true,
  email: true,
  empty: true,
  endsWith: true,
  finite: true,
  gtValue: true,
  includes: true,
  integer: true,
  ipv4: true,
  length: true,
  literal: true,
  looseObject: true,
  ltValue: true,
  maxLength: true,
  maxValue: true,
  minLength: true,
  minValue: true,
  multipleOf: true,
  never: true,
  nonEmpty: true,
  nullable: true,
  nullish: true,
  number: true,
  object: true,
  optional: true,
  optionalBool: true,
  optionalNum: true,
  optionalStr: true,
  picklist: true,
  pipe: true,
  record: true,
  regex: true,
  safeInteger: true,
  startsWith: true,
  strictObject: true,
  string: true,
  toLowerCase: true,
  toMaxValue: true,
  toMinValue: true,
  toUpperCase: true,
  transform: true,
  trim: true,
  trimEnd: true,
  trimStart: true,
  tuple: true,
  union: true,
  unknown: true,
  url: true,
  uuid: true,
};

// Maps module identifiers to emitted identifiers. The routes module's own
// namespace import for '@chttp/val' becomes the emitted module's `val`
// binding; module-level schema consts keep their source names verbatim —
// no rename, so nothing to collide. The emitted module is plain TS that
// never enters a scriptc build, and these declarations live at module scope
// exactly once each; the only generated locals (`s0...`, helper names) come
// from the emitter itself and are kept disjoint (see emitOpenApiModule).
interface PrintCtx {
  names: { [moduleIdent: string]: string };
}

// Members the emitted module may NOT let a schema const shadow, because
// the emitter itself binds them. Beyond this explicit list, any identifier
// starting with `__chttp` is reserved (see reservedName): the emitter's
// generated locals (`__chttpNodes`, `__chttpSchema_<n>`, `__chttpQuery_<n>`,
// `__queryParams`) all carry that prefix. Schema consts colliding with a
// reserved name bail the expression print — bail, never guess, and never
// rename (renaming invents an identity the user's error messages would not
// carry). Every other name is legal: consts keep their source names.
const EMITTED_NAMES: { [n: string]: boolean } = {
  val: true,
  toOpenApiSchema: true,
  __chttpNodes: true,
  __queryParams: true,
  openapiDocument: true,
  chttpRouteTable: true,
};

// Print an expression whose value is a schema. Accepts exactly what val
// schema declarations use: literals (string/number/boolean/null, arrays,
// records), regex literals, identifiers mapped by ctx, `val.<factory>(...)`
// calls and nests of them. Bail (null) on anything else — a ternary, a
// foreign call, a computed member, a template with holes. Printing fewer
// shapes means fewer wrong emits.
function printExpr(p: Parser, ctx: PrintCtx, e: Expression): string | null {
  if (p.isStringLiteral(e) || p.isNoSubstitutionTemplateLiteral(e)) {
    return J(e.text);
  }
  if (p.isNumericLiteral(e)) {
    return e.text;
  }
  if (e.kind === p.k.TrueKeyword) {
    return "true";
  }
  if (e.kind === p.k.FalseKeyword) {
    return "false";
  }
  if (e.kind === p.k.NullKeyword) {
    return "null";
  }
  if (p.isRegularExpressionLiteral(e)) {
    return e.text;
  }
  if (p.isPrefixUnaryExpression(e)) {
    // -1 in minValue(-1); +x never appears in a schema expression
    if (e.operator !== p.k.MinusToken) {
      return null;
    }
    const inner = printExpr(p, ctx, e.operand);
    return inner === null ? null : "-" + inner;
  }
  if (p.isParenthesizedExpression(e)) {
    const inner = printExpr(p, ctx, e.expression);
    return inner === null ? null : "(" + inner + ")";
  }
  if (p.isArrayLiteralExpression(e)) {
    const parts: string[] = [];
    for (const el of e.elements) {
      const s = printExpr(p, ctx, el);
      if (s === null) {
        return null;
      }
      parts.push(s);
    }
    return "[" + parts.join(", ") + "]";
  }
  if (p.isObjectLiteralExpression(e)) {
    const parts: string[] = [];
    for (const prop of e.properties) {
      if (!p.isPropertyAssignment(prop)) {
        return null; // shorthand/computed/spread — bail
      }
      const n = prop.name;
      if (!p.isIdentifier(n) && !p.isStringLiteral(n) && !p.isNumericLiteral(n)) {
        return null;
      }
      let key = J(n.text);
      if (p.isIdentifier(n)) {
        key = n.text;
      }
      const v = printExpr(p, ctx, prop.initializer);
      if (v === null) {
        return null;
      }
      parts.push(key + ": " + v);
    }
    return "{" + parts.join(", ") + "}";
  }
  if (p.isIdentifier(e)) {
    const renamed = ctx.names[e.text];
    return renamed === undefined ? null : renamed; // unresolvable ref — bail
  }
  if (p.isPropertyAccessExpression(e) && p.isIdentifier(e.expression)) {
    // `val.string` — the only bare member access inside a schema expression.
    // Guarded by VAL_FACTORIES below so `v.parse`-style members never print.
    const base = ctx.names[e.expression.text];
    if (base === undefined) {
      return null;
    }
    if (Object.prototype.hasOwnProperty.call(VAL_FACTORIES, e.name.text) !== true) {
      return null;
    }
    return base + "." + e.name.text;
  }
  if (p.isCallExpression(e) && p.isPropertyAccessExpression(e.expression)) {
    // `val.object({...})`, `val.pipe(val.string(), val.minLength(1))`, ...
    const callee = printExpr(p, ctx, e.expression);
    if (callee === null) {
      return null;
    }
    const args: string[] = [];
    for (const a of e.arguments) {
      const s = printExpr(p, ctx, a);
      if (s === null) {
        return null;
      }
      args.push(s);
    }
    return callee + "(" + args.join(", ") + ")";
  }
  return null; // template with holes, binary expr, ... — bail
}

// ---------------------------------------------------------------------------
// detection: handler AST -> RouteOpenApi evidence
// ---------------------------------------------------------------------------

export interface DetectOpenApiOptions {
  // Specifiers this module treats as '@chttp/val' (the real one plus
  // user-configured extras; source-path imports included).
  valSpecifiers: string[];
}

// Names reserved by the emitter itself (EMITTED_NAMES) plus the schema
// factory member check — both read by printableConsts, so they stay in one
// place. A module-level const whose name collides with any reserved name
// never enters the const table, and later references to it bail on the
// table miss: the affected routes document without a schema.
function reservedName(n: string): boolean {
  return Object.prototype.hasOwnProperty.call(EMITTED_NAMES, n) || n.indexOf("__chttp") === 0;
}

interface ValBinding {
  specifier: string; // module specifier the routes module imported
  localName: string; // local namespace identifier ('v', 'val', ...)
}

// Collect namespace-import bindings of '@chttp/val' (or configured
// equivalents) from the module's import statements. Named-import usage
// (`import { object } from '@chttp/val'`) deliberately does not register:
// schema declarations are overwhelmingly namespace-style, and each named
// binding honored multiplies the mis-binding surface for zero day-1 value.
function valBindings(
  p: Parser,
  sf: { statements: Node[] },
  opts: DetectOpenApiOptions,
): ValBinding[] {
  const out: ValBinding[] = [];
  for (const st of sf.statements) {
    if (!p.isImportDeclaration(st) || !p.isStringLiteral(st.moduleSpecifier)) {
      continue;
    }
    const spec = st.moduleSpecifier.text;
    let hit = false;
    for (const v of opts.valSpecifiers) {
      if (spec === v || spec.indexOf(v + "/") === 0) {
        hit = true;
        break;
      }
    }
    if (!hit) {
      continue;
    }
    const clause = st.importClause;
    if (
      clause !== undefined &&
      clause.namedBindings !== undefined &&
      p.isNamespaceImport(clause.namedBindings)
    ) {
      out.push({ specifier: spec, localName: clause.namedBindings.name.text });
    }
  }
  return out;
}

// Whether `e` is `<binding>.<member>(...)` for one of the val bindings.
function valCall(
  p: Parser,
  e: Expression,
  bindings: ValBinding[],
  member: string,
): { b: ValBinding; args: Expression[] } | null {
  if (!p.isCallExpression(e) || !p.isPropertyAccessExpression(e.expression)) {
    return null;
  }
  const acc = e.expression;
  if (acc.name.text !== member || !p.isIdentifier(acc.expression)) {
    return null;
  }
  for (const b of bindings) {
    if (b.localName === acc.expression.text) {
      return { b: b, args: e.arguments };
    }
  }
  return null;
}

// Whether `e` is `<c>.req.<view>(...)` for the handler's context parameter
// name `cname`. `req` is a PROPERTY of Ctx (packages/router/src/index.ts,
// `class Ctx { req: ReqView }`), so the real shape of `c.req.body()` is
// Call(PropertyAccess(PropertyAccess(c, "req"), "body")) — an identifier
// under one property hop, NOT a call under the view access. Anything else
// (`other.req.body()`, `c.reqDeep.body()`) fails the chain and the target
// stays unproven.
function isReqViewCall(p: Parser, e: Expression, cname: string, view: string): boolean {
  if (!p.isCallExpression(e) || !p.isPropertyAccessExpression(e.expression)) {
    return false;
  }
  const viewAcc = e.expression; // PropertyAccess(<c>.req, <view>)
  if (viewAcc.name.text !== view || !p.isPropertyAccessExpression(viewAcc.expression)) {
    return false;
  }
  const reqAcc = viewAcc.expression; // PropertyAccess(<c>, "req")
  return (
    reqAcc.name.text === "req" &&
    p.isIdentifier(reqAcc.expression) &&
    reqAcc.expression.text === cname
  );
}

// Which request view a parse target reads: `c.req.body()` (optionally
// wrapped in JSON.parse(...)) -> body, `c.req.query()`/`queryAll()` ->
// query, `c.req.param()` -> params. Everything else (a variable, a foreign
// call, a literal) is null: the target cannot be proven, so nothing is
// attached. The handler's context param name threads through so `other.req`
// never matches.
function targetOf(p: Parser, e: Expression, cname: string): "body" | "query" | "params" | null {
  let t = e;
  // JSON.parse(<target>) — the documented body pattern (docs/validation.md):
  // the parse argument is the single inner req-view read, so unwrap it.
  if (
    p.isCallExpression(t) &&
    p.isPropertyAccessExpression(t.expression) &&
    t.expression.name.text === "parse" &&
    p.isIdentifier(t.expression.expression) &&
    t.expression.expression.text === "JSON" &&
    t.arguments.length === 1
  ) {
    t = t.arguments[0];
  }
  if (isReqViewCall(p, t, cname, "body")) {
    return "body";
  }
  if (isReqViewCall(p, t, cname, "query") || isReqViewCall(p, t, cname, "queryAll")) {
    return "query";
  }
  if (isReqViewCall(p, t, cname, "param")) {
    return "params";
  }
  return null;
}

// Find module-level const declarations of printable schema expressions.
// Consts print IN SOURCE ORDER into `out`, and each printable one joins
// `names` only AFTER its own print — so `const A = val.object({...});
// const B = val.array(A)` prints B with A already in the table, and the
// declaration list itself is a dependency order (a same-file const can
// only reference consts declared before it — TDZ). An initializer that
// does not print (dynamic, foreign ref) leaves its name unbound and every
// later reference to it bails on the table miss: bail, never guess.
//
// Defensive cycle guard: a same-file const graph cannot cycle (TDZ makes a
// cyclic same-file const program invalid), but a future binding source
// could hand us a generated module where that no longer holds. `names`
// seeding happens after the full statement is processed, so a self- or
// forward reference simply misses the table and bails — never loops.
function printableConsts(
  p: Parser,
  names: { [moduleIdent: string]: string },
  statements: Node[],
  out: OpenApiConst[],
): void {
  for (const st of statements) {
    if (!p.isVariableStatement(st)) {
      continue;
    }
    for (const d of st.declarationList.declarations) {
      if (!p.isIdentifier(d.name) || d.initializer === undefined) {
        continue;
      }
      const name = d.name.text;
      if (names[name] !== undefined || reservedName(name)) {
        continue; // already bound, or the emitter needs this name
      }
      const src = printExpr(p, { names: names }, d.initializer);
      if (src !== null) {
        names[name] = name;
        // Deps: printable consts referenced by this initializer — the
        // subset of `names` that appear as identifiers in the source text.
        // Word-boundary match over printed source; a string literal
        // containing a const name would be matched, which only ever adds a
        // declaration that is not referenced by the real AST — harmless
        // over-approximation of the closure (never under).
        const deps: string[] = [];
        for (const k of Object.keys(names)) {
          if (new RegExp("\\b" + k + "\\b").test(src)) {
            deps.push(k);
          }
        }
        out.push({ name: name, emitted: name, src: src, deps: deps });
      }
    }
  }
}

// Detect val usage for every route with a handlerNode. At most one evidence
// entry per route; shapes that look like validation but cannot be proven
// warn (bail, never guess).
export function detectOpenApi(
  p: Parser,
  model: ModuleModel,
  sf: { statements: Node[]; lineOf(n: Node): number },
  opts: DetectOpenApiOptions,
): void {
  const bindings = valBindings(p, sf, opts);
  if (bindings.length === 0) {
    return; // no val import: no route can carry a schema, nothing to warn
  }
  // Emitted module keeps the val binding as `val` and const names verbatim
  // (no renames, nothing to collide — see PrintCtx).
  const names: { [moduleIdent: string]: string } = {};
  for (const b of bindings) {
    names[b.localName] = "val";
  }
  const consts: OpenApiConst[] = [];
  printableConsts(p, names, sf.statements, consts);
  model.openapiConsts = consts;
  const ctx: PrintCtx = { names: names };

  for (const r of model.routes) {
    if (r.handlerNode === undefined) {
      continue; // handler not analyzable in-file: operation stays schema-less
    }
    const h = r.handlerNode;
    if (!p.isArrowFunction(h) && !p.isFunctionExpression(h)) {
      continue; // handler referenced by name: its body lives elsewhere
    }
    if (h.parameters.length !== 1 || !p.isIdentifier(h.parameters[0].name)) {
      continue; // (c) => ... is the only shape we bind the view target to
    }
    const cname = h.parameters[0].name.text;
    // First val.parse/safeParse call whose target AND schema both prove.
    let found: { target: string; schemaSrc: string; specifier: string; deps: string[] } | null =
      null;
    let sawUnprovable = false;
    const visit = (n: Node): void => {
      if (found !== null) {
        return;
      }
      if (p.isCallExpression(n)) {
        let pc = valCall(p, n, bindings, "parse");
        if (pc === null) {
          pc = valCall(p, n, bindings, "safeParse");
        }
        if (pc !== null) {
          if (pc.args.length !== 2) {
            sawUnprovable = true;
          } else {
            const t = targetOf(p, pc.args[1], cname);
            const printed = printExpr(p, ctx, pc.args[0]);
            if (t !== null && printed !== null) {
              // Deps closure over the const table, dependency-first: a
              // const is appended only after its own dependencies, so the
              // list is a valid declaration order on its own.
              const deps: string[] = [];
              const addDeps = (src: string): void => {
                for (const c of consts) {
                  if (deps.indexOf(c.name) < 0 && new RegExp("\\b" + c.name + "\\b").test(src)) {
                    addDeps(c.src);
                    if (deps.indexOf(c.name) < 0) {
                      deps.push(c.name);
                    }
                  }
                }
              };
              addDeps(printed);
              found = { target: t, schemaSrc: printed, specifier: pc.b.specifier, deps: deps };
            } else {
              sawUnprovable = true;
            }
          }
        }
      }
      p.forEachChild(n, visit);
    };
    visit(h);
    if (found !== null) {
      const f = found as { target: string; schemaSrc: string; specifier: string; deps: string[] };
      model.openapi.push({
        method: r.method,
        path: r.path,
        target: f.target as "body" | "query" | "params",
        valSpecifier: f.specifier,
        schemaSrc: f.schemaSrc,
        deps: f.deps,
      });
    } else if (sawUnprovable) {
      model.openapiWarnings.push(
        "unplugin-chttp: " +
          model.fileName +
          ":" +
          String(sf.lineOf(h)) +
          " val.parse/safeParse target or schema is not statically resolvable — route documented without its schema",
      );
    }
  }
}

// ---------------------------------------------------------------------------
// emit: ModuleModel + evidence -> routes.openapi.ts source
// ---------------------------------------------------------------------------

// ':param' segments -> '{param}' (OpenAPI template syntax). A tail '*' has
// no OpenAPI equivalent; it stays out of the operation's parameters rather
// than guessed into one.
function openApiPath(path: string): string {
  const segs = path.split("/");
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.charAt(0) === ":" && s.length > 1) {
      segs[i] = "{" + s.slice(1) + "}";
    }
  }
  return segs.join("/");
}

// A parameter record: either a literal OpenAPI path parameter, or a splice
// reference to a query-parameter array emitted at module scope.
interface ParamSpec {
  kind: "path" | "querySplice";
  name: string; // path: param name; querySplice: schema id (sN)
}

interface OpSpec {
  method: string;
  path: string;
  params: ParamSpec[];
  bodySchema: string | null; // schema id (sN) when requestBody applies
}

function methodLower(m: string): string | null {
  if (
    m === "GET" ||
    m === "POST" ||
    m === "PUT" ||
    m === "PATCH" ||
    m === "DELETE" ||
    m === "HEAD" ||
    m === "OPTIONS"
  ) {
    return m.toLowerCase();
  }
  return null; // '*' and anything else: no single operation to describe
}

// Deterministic string-key sort (methods inside one path, paths in paths{}).
function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Assemble the document and emit its source. Shape:
//   import { toOpenApiSchema } from <specifier>
//   import * as val from <specifier>
//   const Order = val.object({...})              // consts keep their names
//   const Items = val.array(Order)               // (dependency order)
//   const __chttpNodes = { "0": toOpenApiSchema(Items), ... }
//   const __chttpQuery_0 = __queryParams(__chttpNodes["0"])
//   export const openapiDocument = { openapi: "3.1.0", info, paths }
//   export const chttpRouteTable = [{ method, path }, ...]
// Schemas evaluate in the consumer graph (file header); toOpenApiSchema maps
// them to JSON-Schema-shaped records; openapiDocument references the
// pre-computed nodes, so importing the module yields a ready document.
export function emitOpenApiModule(model: ModuleModel, opts: OpenApiEmitOptions): string {
  const out: string[] = [];
  out.push("// GENERATED by unplugin-chttp — do not edit.");
  out.push("// Source: " + model.fileName);
  out.push("// Side-channel OpenAPI 3.1 document. Never imported by runtime dispatch");
  out.push("// or scriptc: import it where a docs UI or client needs it.");
  out.push("// app.all ('*') routes have no single operation and are listed in");
  out.push("// chttpRouteTable only; tail '*' wildcards have no OpenAPI parameter.");

  // Val specifier for the emitted import: the one the routes module itself
  // used (first evidence wins; a module imports val once, so a single
  // specifier is the only real shape). Consumers on source-path layouts
  // keep their graph intact.
  let valSpec = "@chttp/val";
  for (const e of model.openapi) {
    if (e.schemaSrc !== null) {
      valSpec = e.valSpecifier;
      break;
    }
  }

  // Module-level schema consts, by source name. Only the transitive closure
  // referenced by evidence emits; consts the routes never parse stay out.
  const constByName: { [name: string]: OpenApiConst } = {};
  for (const c of model.openapiConsts) {
    constByName[c.name] = c;
  }

  // evidence keyed by "METHOD path"
  const evidence = new Map<string, (typeof model.openapi)[number]>();
  for (const e of model.openapi) {
    if (e.schemaSrc !== null) {
      evidence.set(e.method + " " + e.path, e);
    }
  }

  // Const closures (union of evidence deps) and schema re-declarations,
  // deduped by printed source in first-use order. Declaration order of the
  // const table is already a dependency order, so emitting the referenced
  // subset in table order satisfies every reference (see OpenApiConst).
  const neededConsts: string[] = [];
  for (const e of model.openapi) {
    if (e.schemaSrc === null) {
      continue;
    }
    for (const d of e.deps) {
      if (neededConsts.indexOf(d) < 0 && constByName[d] !== undefined) {
        neededConsts.push(d);
      }
    }
  }
  const schemaSrcs: string[] = [];
  const schemaIds: { [src: string]: string } = {};
  const idOf = (src: string): string => {
    if (schemaIds[src] === undefined) {
      schemaIds[src] = "__chttpSchema_" + String(schemaSrcs.length);
      schemaSrcs.push(src);
    }
    return schemaIds[src] as string;
  };

  // operations grouped per OpenAPI path key
  const opPaths: string[] = [];
  const opsByKey: { [key: string]: OpSpec[] } = {};
  for (const r of model.routes) {
    if (r.emit !== true) {
      continue; // bailed route: handler identity is not guaranteed
    }
    const ml = methodLower(r.method);
    if (ml === null) {
      continue; // app.all: no single operation to describe
    }
    const params: ParamSpec[] = [];
    for (const s of r.segs) {
      if (s.kind === 1) {
        params.push({ kind: "path", name: s.lit });
      }
    }
    let bodySchema: string | null = null;
    const e = evidence.get(r.method + " " + r.path);
    if (e !== undefined && e.schemaSrc !== null) {
      const id = idOf(e.schemaSrc);
      if (e.target === "body") {
        bodySchema = id;
      } else if (e.target === "query") {
        params.push({ kind: "querySplice", name: id });
      }
      // target "params": path params above already document the surface;
      // the schema adds constraint detail to those names in a future pass.
    }
    const key = openApiPath(r.path);
    if (opsByKey[key] === undefined) {
      opsByKey[key] = [];
      opPaths.push(key);
    }
    opsByKey[key].push({ method: r.method, path: r.path, params: params, bodySchema: bodySchema });
  }
  opPaths.sort(cmpStr);

  // which schema ids are used as query params (drives helper emission)
  const queryIds: string[] = [];
  for (const k of opPaths) {
    for (const o of opsByKey[k] as OpSpec[]) {
      for (const prm of o.params) {
        if (prm.kind === "querySplice" && queryIds.indexOf(prm.name) < 0) {
          queryIds.push(prm.name); // full __chttpSchema_<n> id
        }
      }
    }
  }

  out.push("");
  if (schemaSrcs.length > 0) {
    out.push("import { toOpenApiSchema } from " + J(valSpec) + ";");
    out.push("import * as val from " + J(valSpec) + ";");
    out.push("");
    out.push("// Re-declared val schemas: detection is textual; the values evaluate");
    out.push("// here, in this module's graph, with the val copy that validates");
    out.push("// requests. toOpenApiSchema maps them to OpenAPI 3.1 schema objects.");
    out.push("// Const declarations carry over verbatim, in source (dependency) order.");
    // Source (declaration) order, not evidence order: a same-file const can
    // only reference consts declared before it, so table order is a valid
    // dependency order regardless of which route referenced what first.
    const orderOf = (n: string): number => {
      for (let i = 0; i < model.openapiConsts.length; i++) {
        if (model.openapiConsts[i].name === n) {
          return i;
        }
      }
      return model.openapiConsts.length;
    };
    neededConsts.sort((a, b) => cmpStr(String(orderOf(a)), String(orderOf(b))));
    for (const cn of neededConsts) {
      out.push("const " + cn + " = " + (constByName[cn] as OpenApiConst).src + ";");
    }
    out.push("");
    out.push("const __chttpNodes: Record<string, unknown> = {");
    for (const src of schemaSrcs) {
      out.push("  " + J(String(schemaIds[src])) + ": toOpenApiSchema(" + src + "),");
    }
    out.push("};");
  } else {
    out.push("// No statically provable val schemas in this module.");
  }

  if (queryIds.length > 0) {
    out.push("");
    out.push("// object-schema properties -> OpenAPI query parameter records");
    out.push("function __queryParams(node: Record<string, unknown>): Record<string, unknown>[] {");
    out.push("  const props = (node.properties ?? {}) as Record<string, Record<string, unknown>>;");
    out.push("  const required = new Set((node.required ?? []) as string[]);");
    out.push("  return Object.entries(props).map(([name, schema]) => ({");
    out.push("    name,");
    out.push('    in: "query",');
    out.push("    required: required.has(name),");
    out.push("    schema,");
    out.push("  }));");
    out.push("}");
    for (const id of queryIds) {
      out.push(
        "const __chttpQuery_" +
          id.slice("__chttpSchema_".length) +
          " = __queryParams(__chttpNodes[" +
          J(id) +
          "]);",
      );
    }
  }

  out.push("");
  out.push("export const openapiDocument = {");
  out.push('  openapi: "3.1.0",');
  out.push("  info: { title: " + J(opts.title) + ", version: " + J(opts.version) + " },");
  out.push("  paths: {");
  for (const k of opPaths) {
    out.push("    " + J(k) + ": {");
    const ops = (opsByKey[k] as OpSpec[]).slice().sort((a, b) => cmpStr(a.method, b.method));
    for (const o of ops) {
      out.push("      " + String(methodLower(o.method)) + ": {");
      out.push("        summary: " + J(o.method + " " + o.path) + ",");
      if (o.params.length > 0) {
        const parts: string[] = [];
        for (const prm of o.params) {
          if (prm.kind === "path") {
            parts.push("{ name: " + J(prm.name) + ', in: "path", required: true }');
          } else {
            parts.push("...__chttpQuery_" + prm.name.slice("__chttpSchema_".length));
          }
        }
        out.push("        parameters: [" + parts.join(", ") + "],");
      }
      if (o.bodySchema !== null) {
        out.push("        requestBody: {");
        out.push("          required: true,");
        out.push("          content: {");
        out.push(
          '            "application/json": { schema: __chttpNodes[' +
            J(String(o.bodySchema)) +
            "] },",
        );
        out.push("          },");
        out.push("        },");
      }
      out.push('        responses: { "200": { description: "OK" } },');
      out.push("      },");
    }
    out.push("    },");
  }
  out.push("  },");
  out.push("};");
  out.push("");
  out.push("// Route table passthrough (method/path) for typed clients: the same");
  out.push("// table routes.gen.ts lowers, minus fields only dispatch needs. app.all");
  out.push("// ('*') routes keep their '*' method here.");
  out.push("export const chttpRouteTable: { method: string; path: string }[] = [");
  for (const r of model.routes) {
    if (r.emit !== true) {
      continue;
    }
    out.push("  { method: " + J(r.method) + ", path: " + J(r.path) + " },");
  }
  out.push("];");
  out.push("");
  return out.join("\n");
}
