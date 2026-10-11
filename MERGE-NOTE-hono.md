# MERGE-NOTE — ch3/hono stub (test/stub-hono.ts)

`src/index.ts` had not landed (no `devin/core-v0` yet), so `test/stub-hono.ts`
implements the frozen `createRouter`/`Ch3App`/`Context`/`Ch3Request`/`HttpError`
contract from DESIGN.md §2/§7, subset-clean and serving under both Node and
`scriptc build`. `test/run-hono.sh` copies it to `src/index.ts` **only when that
file is absent** — once the real core lands, the same tests/smoke run against it
untouched, and this stub can be deleted.

## What the stub fakes (vs real core)

- **Matcher**: linear scan over `Entry[]`, not the radix trie, with no
  memoization cache and no `maxCacheEntries` handling. Param/splat/regex/optional
  semantics are contract-faithful (`:p`, `*` tail splat, `:p{re}` checked
  post-match, `:p?` via backtracking matcher).
- **Constraints**: `RouteEntry.constraints` (host/version) is NOT modeled —
  `RouteConstraints` never reaches `add()` on the `Ch3App` surface.
- **Mount**: `route()` flattens a `StubRouter`'s entries + middleware by pattern
  concat (contract-faithful), but only accepts stub apps
  (`instanceof StubRouter`, else throws) — real core accepts `Ch3Core.mount`.
- **Types**: `JsonValue`/`ContextValue` recursive unions are used as designed
  (compiled clean — R5 probe says recursive aliases DO lower). Param-literal
  generics (`PathParams<P>`) are absent — `param(name)` returns `string | null`
  (the §2 fallback).
- **`createRouter` signature**: `(opts: RouterOpts | null = null)` where
  `RouterOpts = { env: {...} | null }` — no `maxCacheEntries` key. The shim
  calls `createRouter({ env })`; if the real signature is `opts?`-optional
  this call site still typechecks.
- **`ServeOpts`/`RequestOpts`**: all-`| null` required fields (subset orthodoxy)
  — if the real core uses `?` optionals, the shim's single delegation site in
  `serve()`/`request()` is the only place to adjust.
- **`request()`**: naive — binds `port 0`, reads `srv.address().port`, one
  `fetch`, close. Returns the response body text (`Promise<unknown>`), not a
  typed response object. `address() as {port:number}` compiled fine.
- **Defaults**: default notFound = 404 empty, default onError honors
  `HttpError.status`, auto-HEAD on (GET fallback + `_headOnly` → `res.end()`
  bare), auto-OPTIONS off, 405 + `Allow` auto-computed, `maxBodyBytes` → 413
  (no socket destroy, response just closes).
- **Chain**: linear cursor per contract; a handler that never calls `next()`
  ends the chain; unsent responses after the chain get `res.end()` (empty 200).

## Shim-local notes for the merger

- `route()` accepts **Hono only** (not `Hono | Ch3App`) — union of a class and
  an interface is SC2009. Raw-app mounts go through `app._router.route()`.
- Route middleware is serialized into ONE `Handler` by `chainHandlers` —
  spread calls are SC1090. Semantics preserved (order, early exit, next()).
- `use()` registers one `use()` call per arg — same reason.
- `return c`, never `return null`, in `void | Context` positions — `null` is
  not assignable to `void | Context` under the checker.
