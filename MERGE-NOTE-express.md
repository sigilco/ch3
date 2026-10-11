# MERGE-NOTE-express — stub-core deltas to fold when `devin/core-v0` lands

`src/index.ts` (the real ch3 core) is absent on this branch — `test/run-express.sh`
copies `test/stub-express.ts` there only when the file is missing, so merging the
core needs **zero file changes**: drop the stub copy and run the script again.

## What the stub fakes (vs the frozen DESIGN.md §2/§7 contract)

- `createRouter({env}) → Ch3App` — a `StubRouter` class instance (not a record
  of closures; SC9001) holding one `State` record.
- Routing — **linear scan** over `Entry[]` with `matchSegs` (literal, `:param`,
  `*` splat, `:param{regex}`, `:param?`). The real core's radix-trie output must
  be observably equal: same params record, same first-match order.
- 405 + `Allow` header when a path matches other methods only (verified by test).
- Auto-`HEAD` → dispatches the GET handler with `_headOnly` (empty body).
- Trailing-slash normalization (`/trail/` ≡ `/trail`) and `?qs` splitting.
- `req.on('data')` body buffering with `maxBody` 413 cutoff (default 1 MiB).
- `use(...args)` — `string | Handler` rest; path-scoped mw via `pathScoped`.
- `route(prefix, sub)` — flattens sub-`StubRouter` entries/mw into the parent
  state with `joinPath`.
- `notFound`/`onError` single handlers; `Context` (`status/header/type/json/
  text/html/body/redirect/set/get`, `sent`, `_vars`), `Ch3Request` (`param/
  query/queries/queryAll/header/body/bodyJson/method/path/raw`), `HttpError`.
- `serve({port,hostname,maxBodyBytes})` → `http.createServer` + `listen`.
- `request(path, opts)` — in-proc fetch helper used only by core-style tests;
  the express shim's own tests use real `app.listen(0)` + `fetch`.
- `ContextValue`/`JsonValue` aliases the shim's `c.set/get`/`c.json` rely on.

## NOT faked / assumptions the real core must keep

- `res.getHeader`/`setHeader` pass-through on `ServerResponse` (shim uses
  `c.res` raw access for `res.set/get/append/headersSent`).
- The shim never calls `c.req.bodyJson()` — it reads `c.req.body()` and parses
  itself (mirroring real body-parser layering).
- If the real `Ch3App` is a record of closures rather than a class, `route()`
  mounting keeps working — the shim only calls the public contract methods.
