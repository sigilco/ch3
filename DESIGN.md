# ch3 — Design

`@sigilco/ch3`: a minimal, first-class-typed Node-HTTP router authored inside the **scriptc subset** so it compiles statically to a single ELF at ~Node-native speed, while remaining an ordinary zero-dependency npm package under Node and Bun. Ships API-compat shim entrypoints (`ch3/h3`, `ch3/fmw`, `ch3/hono`, `ch3/express`) that reuse handler signatures — pure re-mapping surfaces, not runtime bridges.

Status: frozen design contract for the 4-agent implementation fan-out. Every open question below has exactly one recommended answer.

Sources: `REPORT.md` (npm-router survey under scriptc 0.2.8, 2026-10-11), scriptc subset playbook (verified), parent-session fmw-fork measurements.

---

## 0. Non-negotiables (scriptc subset)

The whole package — core and shims — compiles statically under `scriptc build <app> --npm-static @sigilco/ch3 --optimization=speed`. That constraint dictates:

- Sync handlers only. No `Promise`/`async`/`await`/`then` anywhere on the request path.
- `null`, never `undefined`, in every union and return (`X | undefined` → SC3004).
- Plain `({})` records only. No `Map`/`Set`/`Object.create(null)`/`Object.freeze`/class-instances-as-dicts/module-namespace values in runtime data structures. Classes are allowed only for `Context`, `Ch3Request`, and `HttpError` — never used as dictionaries.
- Indexed `for` loops only. `for…of` over arrays is permitted; `for…in` never. No `stack.pop()` in expression position — peek then pop.
- `String(x)`/`Number(x)` coercion at function entry for params arriving `unknown`.
- No `new Function`/`eval` (SC2020). No `instanceof` against non-program classes; no `new.target`; no `URL.parse`/`canParse` (use `try/catch new URL`); no object-shorthand/method-shorthand/module-exports-shorthand forms.
- `import * as http from 'node:http'` style; `req.url`/`req.method` treated as non-optional `string`.
- All route/middleware tables are concretely typed (`Handler[]`, `{[k:string]: RouteEntry}`) — no `any[]`/`unknown[]` tables, because a `ServerResponse` cannot cross an `any`-typed call (SC1090).
- `res.end(...)` always as a statement. Body collection via `req.on('data', (c) => …)` + `toString()` + join — `Buffer.concat`/`req.pipe` are unlowered.
- Authored as plain ESM. CJS (for Node consumers) is bundler-emitted dist only — never hand-authored, never on the scriptc path.
- The published `.d.ts` surface: concrete types, `| null` unions only, zero DOM symbols, no generic that resolves to `unknown` at a package boundary.

---

## 1. Router core choice

### Candidates

| Core | Shape | Verified (patched) rps | Wildcard | Regex param | Host/version | Subset-fit | Code size |
|------|-------|------------------------|----------|-------------|--------------|------------|-----------|
| memoirist-style | radix trie, inert `{[seg]:Node}` tables + memoized match cache | 104.9k (3 patches) | yes (`*`) | partial (post-match check) | no | best — records + indexed loops | smallest (~150 LOC match) |
| rou3 | radix trie, param-map | 95.6k (~10 patches) | yes (`**`) | no | no | good but heavier — boxed record writes | medium |
| find-my-way | radix + optional `compile()` + constraint solvers | 60–92k (parent fork, ~parity) | yes | yes | yes | worst — solvers, `new Function` opt-in, largest surface | largest |

### Decision: **memoirist-style inert-table radix, with a post-match constraint list**

ch3's internal matcher is a single radix trie whose children live in plain `({})` records, plus a memoized full-path lookup cache — the shape that needed only 3 patches upstream and hit 104.9k rps (96% of baseline). We borrow the semantics; we do not vendor.

- **Wildcard**: `*` tail-splat (`/files/*` → `c.req.param('*')`). Ambition met.
- **Regex params**: `:id{\d+}` compiles to a `RegExp` stored on the `RouteEntry` and checked **after** the trie match, as a route constraint. Keeps the trie segment-typed (no regex nodes on the hot path); regex misses fall through to the next candidate → 404. Ambition met without hot-path cost. (Verify `RegExp.exec` lowering in the smoke gate; vite's regex utils already ran statically.)
- **Host/version constraints**: same mechanism — `RouteEntry.constraints` is a `{regex, host, version}` record checked post-match only when present (`null` otherwise, so unconstrained routes never pay for it). Satisfies the fmw-compat ambition at a fraction of fmw's code size, no constraint-solver framework.
- **Optional params**: `:p?` expands at *registration* into the with/without variants (fmw-style). Cap: 3 optional segments per pattern (2³=8 routes) — more is a registration-time error.
- **Method dispatch**: per-node `{[method: string]: RouteEntry}` record (not a `Map`). Lookup = trie walk → `node.methods[method]`.
- **Memoization**: `{[method+ ' ' + path]: MatchResult | 0}` record, unbounded-by-default but cleared on any `add`. A `routerOptions.maxCacheEntries` (default 4096) with drop-oldest eviction prevents pathological growth. Params are re-extracted on cache hit? No — cache stores the full `MatchResult` including `params` (safe: `params` is a fresh record per *registration*... it must be **cloned** on hit so handlers can't mutate shared state — clone = `{...}` spread? Not in the playbook. Implement `cloneParams` as an indexed loop over `paramNames` — cheap, keeps subset purity).

Rejected: rou3 (more patches for fewer features we need), vendored fmw (patch fragility per npm release; its constraint solvers and `compile()` are dead weight under the subset), compiled lookup (`new Function` is SC2020 — impossible anyway).

---

## 2. API surface freeze

```ts
import { createRouter } from '@sigilco/ch3'

const app = createRouter()

app.get('/json', (c) => c.json({ hello: 'world' }))
app.get('/user/:id', (c) => c.json({ id: c.req.param('id') }))
app.get('/files/*', (c) => c.text(c.req.param('*') || ''))
app.post('/echo', (c) => c.text(c.req.body()))

app.use((c, next) => { c.header('x-powered-by', 'ch3'); next() })
const api = createRouter()
api.get('/health', (c) => c.json({ ok: true }))
app.route('/api', api)

app.notFound((c) => c.status(404).text('not found'))
app.onError((err, c) => c.status(500).json({ error: err.message }))

app.serve({ port: 3000 })
```

### Decisions

- **Handlers**: `type Handler = (c: Context, next: Next) => void | Context`. Return value ignored at runtime; `| Context` exists so `return c.json(...)` arrow shorthand typechecks. `next` is a linear continuation (see below). Terminal route handlers are the same type; a handler that calls `next()` after the last middleware is a no-op.
- **Middleware model: linear chain** (express-style), not onion. `app.use(fn)` and `app.use('/prefix', fn)` push onto ordered arrays; dispatch runs global middleware → route middleware (`app.get(path, mw1, mw2, handler)`) → handler, via an index cursor. `next()` = resume at index+1. Chosen because (a) the subset is sync-only — onion semantics need return-value unwinding that collapses to linear anyway, and (b) linear matches 3 of 4 shim surfaces (express/h3/fmw) and is what the subset compiles cheapest. Rejected: koa-style onion (async-shaped, no benefit when sync).
- **Error handling**: `app.onError((err, c) => …)` — single catch-all around the whole chain; default impl sends `500` + empty body and never rethrows. `throw new HttpError(status, message, extras|null)` short-circuits to `onError` with `err.status` honored by the default. Not-found path is separate: `app.notFound(handler)` (default: 404 empty). A matched route whose method differs → 405 with `Allow` header auto-computed from the node's method table (cheap: keys of `node.methods`).
- **Context `c`** (frozen surface):

  | Member | Type | Notes |
  |---|---|---|
  | `c.req.param(name)` | `string \| null` | `'*'` for splat |
  | `c.req.query(name)` | `string \| null` | last-wins |
  | `c.req.queries(name)` | `string[]` | all values, `[]` if absent |
  | `c.req.queryAll()` | `{[k:string]: string}` | last-wins map |
  | `c.req.header(name)` | `string \| null` | case-insensitive via lowercased index built once at dispatch |
  | `c.req.body()` | `string` | fully buffered before dispatch |
  | `c.req.bodyJson()` | `JsonValue` | `JSON.parse(body())`, throws `HttpError(400)` on bad JSON |
  | `c.req.method`, `c.req.path`, `c.req.raw` | `string`, `string`, `IncomingMessage` | `raw` = escape hatch |
  | `c.json(obj)` | `Context` | sets `content-type`, `res.end(JSON.stringify(obj))` as statement |
  | `c.text(s)`, `c.html(s)` | `Context` | text/plain, text/html |
  | `c.body(buf)` | `Context` | raw `Buffer`/`string` pass-through |
  | `c.status(n)`, `c.header(k,v)`, `c.type(t)` | `Context` | chainable, pre-body only |
  | `c.redirect(url, code?)` | `Context` | `code` default 302 |
  | `c.set(k, v: ContextValue)`, `c.get(k)` | `Context`, `ContextValue \| null` | middleware handoff bag |
  | `c.res` | `ServerResponse` | escape hatch for shims/streaming |
  | `c.sent` | `boolean` | true once body flushed |

  `type ContextValue = string | number | boolean | null | {[k: string]: ContextValue}` — closed recursive union. **Checker risk flagged**: recursive aliases may hit SC3004; fallback contract is `ContextValue = string | number | boolean | null` plus `c.setAny`/`getAny` removed entirely (apps store serialized strings). Decision made at T2 by a compile probe; whichever compiles is the contract.

- **Params typing from path literals** (runtime-free, types only):

  ```ts
  type PathParams<P extends string> =
    P extends `${string}:${infer Param}/${infer Rest}` ? { [K in Param | keyof PathParams<Rest>]: string } :
    P extends `${string}:${infer Param}` ? { [K in Param]: string } : {}
  ```

  `app.get<P extends string>(path: P, h: Handler & ((c: Context<P>) => …))` gives `c.req.param('id')` a literal-key check. **Flagged**: template-literal conditional types are exotic for scriptc's checker — they never emit runtime code so the requirement is "typechecks under tsgo", but keep machinery this shallow (single-level `infer` recursion, no distributive tricks). Fallback: `param(name)` returns `string | null` untyped + `c.req.params` as `Record<string,string>`; the generic overloads live behind the same signature so dropping them never breaks runtime.

- **Route groups / mount**: `app.route(prefix, subRouter)` flattens sub-routes into the parent trie at registration (prefix concat). Middleware registered on the sub-router via `subRouter.use` is re-registered as path-scoped middleware on the parent — preserves semantics, zero nested dispatch cost.
- **Wildcard syntax**: `*` only, tail position only. Registration-time error elsewhere.
- **Optional params**: `:p?` tail-or-mid, registration-time expansion (§1).
- **HEAD/OPTIONS**: auto-HEAD — a HEAD request dispatches the GET handler with `c._headOnly` set, helpers write headers but `res.end()` with no body. Auto-OPTIONS: **no** (CORS is a middleware concern; shims may layer it).
- **Body collection**: *always* buffered before dispatch — the node adapter attaches `data`/`end` listeners and only calls `core.dispatch` on `end`. This is what makes `body()` synchronous and is the subset's only viable shape. `serve({maxBodyBytes})` default `1<<20`; overflow → `413` + socket destroy. This doubles as the streaming answer: **streaming responses are a v1 non-goal** (no `Readable`/`ReadableStream`/SSE helpers; chunked writes require async scheduling the subset can't express). Escape hatch: `c.res`/`c.req.raw` — a handler may grab the raw handles, `c.sent = true` manually, and write whatever it wants, documented as leaving the helpers' guarantees.
- **`app.serve({port, hostname?, maxBodyBytes?})`** → `http.createServer(nodeAdapter(app.handler()))` + `listen`, returns the `Server`. `app.handler()` returns `(req: IncomingMessage, res: ServerResponse) => void` for embedding in an existing server. `app.request(path, {method?, body?, headers?})` → test helper: binds an ephemeral `serve({port:0})`, issues one `fetch` (client-side `fetch` *is* static-supported), closes. Honest in-process test path with no faked `IncomingMessage`.
- **Trailing slash**: normalized away except root (`/a/` ≡ `/a`). **Case**: sensitive.
- **`c.env`**: not a Node concept — replaced by `createRouter({env: {...}})` accessible as `c.env` (plain record passed through). Kept for hono-symmetry where `env` is usually config.

---

## 3. Package topology

```
src/
  index.ts          # public surface: createRouter, HttpError, types (Handler, Context, …)
  core/router.ts    # Ch3Core: trie + registration + dispatch + cache   (Agent A)
  core/match.ts     # segmentize, pattern parse (:p, :p?, *, :p{re}), param extract, cloneParams
  context.ts        # Context class: response helpers, vars bag, flags  (Agent B)
  request.ts        # Ch3Request: param/query/header/body accessors
  errors.ts         # HttpError
  adapters/node.ts  # IncomingMessage/ServerResponse → dispatch (body collect, head-only)
  serve.ts          # app.serve / app.handler / app.request
  shims/h3.ts       # ch3/h3   (Agent C)
  shims/fmw.ts      # ch3/fmw  (Agent C or D)
  shims/hono.ts     # ch3/hono (Agent D)
  shims/express.ts  # ch3/express (Agent D)
test/               # node:test suites per surface + a scriptc smoke app
bench/              # bench agent's workspace (§5)
```

- **Build**: `tsdown` — emits per-entry `dist/*.mjs` + `dist/*.d.mts` (ESM, the scriptc entry) and `dist/*.cjs` + `dist/*.d.cts` (CJS for Node). One tsdown entry per public subpath. All inputs are plain ESM so the ESM dist carries no `__importStar`/interleave boilerplate; the CJS dist is for humans/bundlers only and never enters a scriptc build.
- **`exports` map** (each subpath `{types, import, require}` in that order):

  ```json
  ".":        {"types": "./dist/index.d.mts", "import": "./dist/index.mjs", "require": "./dist/index.cjs"},
  "./h3":     {"types": "./dist/h3.d.mts",     "import": "./dist/h3.mjs",     "require": "./dist/h3.cjs"},
  "./fmw":    {…}, "./hono": {…}, "./express": {…}
  ```

- **Zero runtime dependencies.** `tsdown`, `typescript`, test runners are devDeps only.
- **Versioning**: `0.x` semver, `0.1.0` first publish, manual bumps; `engines.node >= 18`.
- **CI gates** (each is a scriptc command, run in CI): `scriptc coverage test/smoke.ts --npm-static @sigilco/ch3` must report **100% static**; `scriptc build` of the smoke app must succeed and serve `/json`/`/user/:id` under autocannon ≥1 sanity run; `tsc --noEmit` + `node --test`.
- Shims are **pure re-mapping code**: each `shims/*.ts` imports only from `../index.ts` (`createRouter`, `Context`, `Ch3Core` types) and exports the foreign factory signatures. No framework code is bundled or referenced — that is the whole point (the real packages cannot compile at all).

---

## 4. Adapter contract

Common wiring, identical across shims: each shim factory calls `createRouter()` internally, wraps `Ch3Core.add`/`dispatch`, and exposes the foreign surface. Foreign handlers are *adapted*, not wrapped by runtime code from the real package. `ShimAdapter` signature:

```ts
// Every shim entry exports a factory shaped like the source package's:
export type ShimAdapter<ForeignApp> = (options?: ShimOptions | null) => ForeignApp
//   Internally: const app = createRouter(); … adapt …; return foreignApp
interface ShimOptions { [k: string]: string | number | boolean | null }
```

### `ch3/h3` (target ~80% of handler usage — best target, ship first)

| h3 API | ch3 mapping |
|---|---|
| `createApp()` / `createRouter()` | `createRouter()` core + `AppFacade{use,handler}` |
| `defineEventHandler(h)` | identity cast to `Handler` |
| `event` object | `H3Event` class wrapping `Context`: `event.node.req`=`c.req.raw`, `event.node.res`=`c.res`, `event.context`=`c.vars` bag |
| `getRouterParam(e,n)` | `e._c.req.param(n)` |
| `getQuery(e)` / `getRequestQuery` | `c.req.queryAll()` |
| `readBody(e)` / `readRawBody(e)` | `c.req.bodyJson()` / `c.req.body()` (already buffered — sync) |
| `setResponseStatus/Header`, `send`/`sendError` | `c.status/header`; `res.end` |
| `createError` | `HttpError` |
| `app.use(route?, handler)` | core path-scoped middleware |

Divergences (documented): no nitro hooks/plugin lifecycle; no `event.node` adapter breadth beyond req/res; no websocket/SSE utils; handlers are sync — `async` h3 handlers throw a clear "async handlers unsupported under ch3" error at wrap time (detect via `h.constructor.name === 'AsyncFunction'`).

### `ch3/fmw` (target ~90% of `on`/`find` — cheapest)

`FindMyWay(opts)` → `{on, register, off, find, all, defaultRoute, prettyPrint}`. Direct map to `core.add`/`core.find`/`core.all`. `:param`, `*`, `:p?` identical semantics. Versioned routes `{version}` → `RouteEntry.constraints.version` checked against `accept-version` header; **semver support = exact + `x`-ranges + caret** via a ~80-line subset-safe comparator — full semver spec (ranges/OR) documented divergence. `caseSensitive`, `maxParamLength` options honored; `prettyPrint()` implemented (plain string walk — useful debugging anyway). Divergences: no constraint-solver plugin API, no async find hooks, `find` returns `{handler, params, store}`-shaped plain record.

### `ch3/hono` (target ~75% of route-file code)

`new Hono()` → facade over `createRouter`: `app.get/post/put/delete/patch/options/head`, `app.use`, `app.route`, `app.notFound`, `app.onError`, `app.fire()` (no-op logging parity), `app.fetch` absent — use `app.request`/`serve`. `c` **is** ch3's `Context` (one-line facade: `c.req.param|query|header`, `c.req.parseBody()`≈`bodyJson`, `c.json|text|html|redirect`, `c.status`, `c.set/get`, `c.env`). Divergences (documented, the "edge-shim caveat"): handlers **return `void | Context` not `Response`** — `c.json()` buffers straight to `res.end`; a handler returning a foreign object is JSON-serialized at the edge as a last resort; middleware ecosystem imports (cors/jwt/zod helpers are fetch-typed) don't port; no `c.executionCtx`, no SSE/streaming helpers.

### `ch3/express` (target ~70% of JSON-API route code — last, most debt)

`express()` → `{get,post,put,delete,patch,all,use,listen,route,set}`. `req`: `params` (from match), `query`, `path`, `method`, `headers`, `body` (populated **only** when `express.json()` middleware is mounted — buffers are always there; the mw JSON-parses + stashes on `c.vars`, matching real express semantics of "body only exists after parser middleware"), `get(name)`, `app`. `res`: `json`, `send` (string→text, object→json, Buffer→octet-stream), `status`, `set`/`get`, `type`, `redirect`, `locals`→`c.vars`, `sendStatus`. `next()` = linear continuation. **4-arity error middleware supported**: when the chain throws, the cursor skips forward to the next fn whose `length === 4` — real express semantics, cheap under linear dispatch. `app.listen` = `app.serve`. Divergences: no `render`/view engines, no `sendFile`/`sendfile`/`download`, no `express.static`, no `Router()` sub-routers? — `express.Router()` **is** supported (it maps to `createRouter` + `route()` mount — cheap, include it); `req.body` absent without parser mw; no cookie/session helpers; `app.set` stores but most keys are no-ops.

Shared doc promise: every shim page states the coverage target, the divergences list, and the async-handler error message.

---

## 5. Bench spec (for the bench agent — buildable blind)

**Harness**: `autocannon` for throughput; `hyperfine` for cold start; plain RSS sampling. Everything scripted under `bench/` so `bash bench/run.sh` reproduces the matrix.

**Route table** — one canonical app per framework, same routes:

| # | Route | Shape | Response |
|---|-------|-------|----------|
| 1 | `GET /json` | static | `{"hello":"world"}` (~15B) |
| 2 | `GET /user/:id` | param | `{"id":"<v>"}` |
| 3 | `POST /echo` | body | echo request body verbatim |
| 4 | `GET /deep/a/b/c/d/e` | deep static | `{"ok":true}` |
| 5 | `GET /files/*` | wildcard | splat echoed as text |
| 6 | `GET /missing` | 404 | framework default |
| 7 | mixed table | 100 routes: 60 static / 30 param / 10 wildcard, uniform-random hits | `{"ok":true}` |

**Parameters**: warmup `autocannon -c 16 -d 2` (discarded), measure `autocannon -c 64 -d 6`, median of 3 runs per cell. Payloads: `POST /echo` at 64B and 1KiB. Record rps, latency p50/p99, MB/s. Also: binary size, `hyperfine --warmup 3 '<bin> --version'`-style cold start, RSS after 100k requests.

**Matrix**:

| Subject | node 24 | bun | scriptc ELF |
|---|---|---|---|
| ch3 | ✓ | ✓ | ✓ (primary) |
| h3 (+node adapter) | ✓ | ✓ | n/a — cannot compile (documented) |
| hono (+@hono/node-server) | ✓ | ✓ | n/a |
| find-my-way (+raw http) | ✓ | ✓ | ✓ via fmw-fork numbers cited, or local fork if available |
| express | ✓ | ✓ | n/a |
| raw `node:http` baseline | ✓ | ✓ (Bun.serve) | ✓ |

Ceiling reference (one run each, same routes 1–3): **go `net/http` + chi**, **rust `axum`**, **C `mongoose`** (single-file, easy static build). These frame "how far from native" without being comparison targets.

**Environment**: pin VM class in `bench/ENV.md` (record `nproc`, CPU model, `scaling_governor`, kernel); report **ratios** against the raw-node-http cell on the same machine — absolute numbers carry ±50% shared-VM noise (REPORT.md caveat).

---

## 6. Risks & decisions register

| # | Decision / rejected alternative | Reason | Risk |
|---|---|---|---|
| R1 | **No async handlers** (rejected: promise chains, `await` on handlers) | subset is sync-only; Promises can't cross the static boundary. **Workaround story**: precompute at startup, use sync APIs (better-sqlite3-style), spawn `node:worker_threads` only for *non-request* work, or drop to `c.res` raw handle and manage the response manually — all documented in `docs/async.md` | Users expecting `await db.query()` get a clear wrap-time error, not a silent hang |
| R2 | **No fetch/`Response` API** | no web globals in scriptc static tier | Shim `c.json` divergence is the cost — mitigated by hono shim docs |
| R3 | **Linear middleware** (rejected: onion) | sync-only; onion adds nothing without async | express 4-arity error-mw preserved via cursor skip |
| R4 | **Borrow memoirist semantics** (rejected: vendor memoirist/rou3) | upstream releases invalidate 3–10 patches; shipping patched node_modules isn't a product | we must re-implement the trie correctly — mitigated by differential tests vs memoirist behavior on 10k generated paths |
| R5 | **`ContextValue` recursive union** | may hit SC3004 | fallback contract pre-defined (§2), decided at T2 by probe |
| R6 | **Template-literal param types** | exotic for scriptc's type checker | runtime-free — worst case we ship `string\|null` + `params` record; fallback keeps signature shape |
| R7 | **Auto-HEAD on, auto-OPTIONS off** | HEAD is near-free; OPTIONS is policy | none |
| R8 | **Always-buffered body** | only sync-safe shape; also what makes `body()` work | memory bound → `maxBodyBytes` (1 MiB default) + 413 |
| R9 | **tsdown dual-emit** (rejected: tsc dual) | tsc dual emits CJS boilerplate that can't compile if ever scanned; tsdown ESM output is clean | tsdown/rolldown maturity — gate: dist smoke-compiles |
| R10 | **No streaming/SSE v1** | requires async scheduling | `c.res` escape hatch documented |
| R11 | **Semver-lite for fmw versions** | full solver = fmw-size complexity | exact/x/caret covers the real `accept-version` usage; documented |

---

## 7. Implementation work-breakdown (4 agents, parallel-safe)

The contract below is frozen — agents implement against these signatures **exactly**.

```ts
// ---- core/router.ts (Agent A) ----
export type Next = () => void
export type Handler = (c: Context, next: Next) => void | Context

export interface RouteConstraints {
  regex: RegExp | null        // param regex, applies to the single marked param
  host: string | null
  version: string | null      // semver-lite match vs accept-version
}
export interface RouteEntry {
  method: string
  pattern: string             // canonical, post-expansion
  paramNames: string[]        // ordered
  regexParam: string | null   // param name carrying .regex
  handler: Handler
  middleware: Handler[]
  constraints: RouteConstraints | null
}
export interface MatchResult {
  handler: Handler
  middleware: Handler[]       // route-level, appended after globals
  params: { [k: string]: string }
  entry: RouteEntry
}
export interface Ch3Core {
  add(method: string, path: string, handler: Handler, middleware: Handler[], constraints: RouteConstraints | null): void
  find(method: string, path: string): MatchResult | null
  allowedMethods(path: string): string[]      // for 405 Allow
  dispatch(c: Context, match: MatchResult | null): void   // runs chain + handler + onError/notFound
  all(): RouteEntry[]
  mount(prefix: string, sub: Ch3Core): void   // flatten sub.all() with prefix
}
```

```ts
// ---- context.ts / request.ts (Agent B) ----
export class Ch3Request {
  param(name: string): string | null
  query(name: string): string | null
  queries(name: string): string[]
  queryAll(): { [k: string]: string }
  header(name: string): string | null
  body(): string
  bodyJson(): JsonValue
  readonly method: string
  readonly path: string
  readonly raw: IncomingMessage
}
export class Context {
  readonly req: Ch3Request
  readonly res: ServerResponse
  readonly env: { [k: string]: ContextValue }
  sent: boolean
  status(n: number): Context
  header(k: string, v: string): Context
  type(t: string): Context
  json(obj: JsonValue): Context
  text(s: string): Context
  html(s: string): Context
  body(b: Buffer | string): Context        // Buffer|string union OK (concrete)
  redirect(url: string, code: number): Context
  set(k: string, v: ContextValue): void
  get(k: string): ContextValue | null
}
```

```ts
// ---- public API (Agent B) ----
export interface Ch3App {
  get<P extends string>(path: P, ...fns: Handler[]): Ch3App   // same for post/put/delete/patch/options/head/all
  use(...args: (string | Handler)[]): Ch3App                  // (fn) | (pathPrefix, fn)
  route(prefix: string, sub: Ch3App): Ch3App
  notFound(h: (c: Context) => void | Context): Ch3App
  onError(h: (err: HttpError | Error, c: Context) => void | Context): Ch3App
  handler(): (req: IncomingMessage, res: ServerResponse) => void
  serve(opts: { port: number; hostname?: string; maxBodyBytes?: number }): Server
  request(path: string, opts?: { method?: string; body?: string; headers?: {[k:string]:string} }): Promise<unknown> // test helper — promise at the *edge* is fine (fetch is static)
}
export function createRouter(opts?: { env?: {[k:string]: ContextValue}; maxCacheEntries?: number }): Ch3App
```

```ts
// ---- shims (Agents C/D) — each exports a ShimAdapter ----
export type ShimAdapter<ForeignApp> = (options?: ShimOptions | null) => ForeignApp
// shims/h3.ts     → createApp/createRouter/defineEventHandler/H3Event/helpers
// shims/fmw.ts    → FindMyWay-compatible factory
// shims/hono.ts   → Hono class facade
// shims/express.ts→ express() function + express.Router + express.json
```

### Task order

1. **T0 Scaffold** (Agent A, blocker): package.json/tsconfig/tsdown/exports/CI scripts. Empty exports so others can import.
2. **T1 Core** (Agent A): `core/match.ts` + `core/router.ts` — trie, expansion, cache, constraints, dispatch-cursor, 405.
3. **T2 Context+adapter** (Agent B, needs only `Ch3Core` interface): `context.ts`, `request.ts`, `adapters/node.ts`, `serve.ts`, `errors.ts`, `index.ts`. Compile probe for `ContextValue` union (R5) and param-literal types (R6) lands here — fallbacks are pre-decided, no redesign.
4. **T3 Shims — parallel**: `h3`+`fmw` (Agent C), `hono`+`express` (Agent D). Depend only on the frozen interfaces above — start at T0.
5. **T4 Bench** (Agent E, parallel): `bench/` suite per §5, comparison apps for h3/hono/fmw/express/native + go/rust/C ceilings.
6. **T5 Docs+tests**: README with subset-authored examples, `docs/async.md` workaround story, shim divergence pages, differential-match tests vs memoirist semantics.

Contract files agents must not diverge from: this file + `src/index.ts` exports. Anything that fails the scriptc coverage gate blocks merge; the fix is *subset-surgery on our code*, never weakening the gate.
