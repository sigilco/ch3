# MERGE-NOTE: ch3/fmw shim — stubbed core

`src/shims/fmw.ts` was written and verified against `test/stub-fmw.ts`, an
in-memory implementation of the frozen `Ch3Core`/`Context`/`Ch3App` contract
from DESIGN.md §7. All core access goes through ONE seam file,
`src/shims/fmw-core-bind.ts`; nothing else in the shim imports the stub.

## Reality check (2026-10-11): `devin/core-v0` shipped with a DIFFERENT API

The branch landed after this shim was written, and it does not export the
§7 contract. Actual surface (see `src/index.ts` on `devin/core-v0`):

- `App` class + `createRouter(): App`; `Ctx<P>`/`ReqView<P>` classes;
  `Handler = (c: Ctx) => void` (single arg — no `next`); `Middleware =
  (c, next) => void`; `ParamKey<P>` template-literal param typing.
- NO `Ch3Core`, `createCore`, `RouteEntry`, `MatchResult`,
  `RouteConstraints`, `Context`, `Ch3App` exports.
- Route trie internals (`RouteNode`, `matchNode`, `findEntry`, `addRoute`)
  are module-private — there is no `find(method, path)` API.
- `App._add(method, path, handler)` registers with a snapshot of `use()`d
  middleware; `app.handler()` / `app.serve({port,host})` dispatch;
  `app.route(prefix, sub)` mounts.

## Adapter recipe for the integrator (in `fmw-core-bind.ts`, ~120 lines)

- `createCore()` → `CoreAdapter implements Ch3Core` wrapping `new App()`:
  - `add(m, path, h, mw, cons)` → `app._add(m, path, c => h(ctxShim(c), noop))`.
    `mw` is `[]` in every shim call site; `cons` is stored-ignored anyway.
  - `find(m, path)` → return `null`. The shim's own `_scan` performs all
    matching (`core.find` is only a fast-path bonus), so this is CORRECT,
    just less shared-trie parity.
  - `allowedMethods` → `[]` (shim's own `allowedMethods` scans `this.routes`).
  - `dispatch` → `app.handler()(req, res)` if needed (shim never calls it).
  - `all`/`mount` → iterate `app._fns`/`app.route(prefix, subApp)`.
- `ctxShim(c: Ctx)` → a `Context`-shaped wrapper: `c.req.raw`,
  `c.req.param(n)`, `c.req.queryAll()`, `c.req.header(n)`, `c.res` all
  exist on the real `Ctx`/`ReqView`, so the wrapper is thin.
- Caveat: versioned routes registered into `App`'s trie dispatch by
  method+path only — `app.handler()` would serve the wrong version.
  Consumers needing version semantics must dispatch via `router.lookup`
  (the shim), not `app.handler()`.
- Alternative (simpler): keep the shim's matching fully self-contained and
  drop the `core.find` fast path entirely; bind `add` to `app._add` only so
  `app.handler()`/`serve` also expose the routes.

Original plan (if a §7-conformant core ever lands instead): flip the two
`../../test/stub-fmw.ts` specifiers in `fmw-core-bind.ts` to `../index.ts`.

## What the stub provides (real behaviors the shim depends on)

- `createCore()` → `Ch3Core` with `add/find/allowedMethods/dispatch/all/mount`.
  `find` returns `{handler, middleware, params, entry}` or `null`.
  `add` accepts `(method, corePath, handler, middleware[], constraints)` where
  `corePath` uses `:name`, `:name{regex}`, `:name?` (optional), `*` — the shim
  already translates fmw patterns into this syntax.
- `StubCore` matching semantics: linear scan, per-segment score
  static=2/param=1/wildcard=0, `:x?` expanded into bitmask variants (cap 3),
  regex params re-built from the `{re}` segment suffix into
  `RouteEntry.constraints.regex`.
- `Context`/`Ch3Request` with `param/query/queries/queryAll/header/body/
  bodyJson`, response helpers (`json/text/html/body/redirect/status/header/
  type`), `vars` (`set`/`get`), `env`, `sent`.
- `createRouter(opts)` → `Ch3App` (`StubRouter`): verb methods, `use`, `route`
  (→ `core.mount`), `notFound`, `onError`, `handler()` (body collect via
  `req.on('data')` + join, 413 on `maxBody` overflow, 405 + `allow` on method
  miss, else `core.dispatch`), `serve`, `request`.

## What the stub FAKES (replace-with-real-core watch list)

- **No radix trie.** `StubCore.find` is a linear scan with lexicographic
  segment scoring; `core.find` results are equivalent for the patterns the
  shim emits, but ordering ties may differ from the real trie.
- **No middleware ordering beyond array order**; `use` is a flat global list,
  `mount` only copies routes with a prefix concat (no prefix-trie scoping).
- **`dispatch` error path** routes thrown errors to a single `onError` fn;
  `HttpError.extras` is carried verbatim.
- **`handler()` body limit** is `opts.maxBodyBytes`, applied to the collected
  body; chunked/edge cases (size overflow mid-stream) are approximated.
- **`constraints` semantics**: the stub only interprets `regex` inside
  `RouteEntry.constraints`; `version`/`host` are stored but never consulted —
  ALL version/host matching lives inside the shim's own `_scan`/`_constraintPass`
  (by design: fmw constraint resolution stays in the shim).
- **`queryAll`** returns last-value-wins `{[k]: string}`; the real core may
  differ on multi-value handling.
- **`serve`/`request`** spin a real `node:http` server on port 0 (request) or
  the given port (serve); no TLS, no keep-alive tuning, no `listen` options
  beyond port/host.
- **Params are raw strings** — no `decodeURIComponent` inside the stub
  (`Ch3Request.param` returns the raw segment). The shim decodes in its own
  wrapper, so this is deliberate, but the real core must not double-decode.
- **`Context.sent`** is a stub-maintained flag; `res.writableEnded` is not
  consulted.

## Subset-compliance note

The stub is test-only but subset-clean (compiles under `scriptc build`, no
`--dynamic`). Both files use `Object.keys(dict).indexOf(k)` for
maybe-absent-key reads: absent-key reads on `{[k:string]:T}` records throw
`record has no key` at scriptc runtime — `!== undefined` does NOT rescue them,
and `in` is rejected on index signatures (SC1090). Optional fields on
fixed-shape records are guarded with `'field' in rec` after narrowing off
`| undefined`/`| null`.
