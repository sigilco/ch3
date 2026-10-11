# `ch3/hono` — Hono API-compat shim

```ts
import { Hono } from '@sigilco/ch3/hono' // was: 'hono'
```

A pure re-mapping surface: `new Hono()` wraps ch3's `createRouter`, and hono
handler signatures keep working. No code from the real `hono` package runs.
**Coverage target: ~75% of route-file code.**

## Mapped surface

| hono | ch3/hono |
|---|---|
| `app.get/post/put/delete/patch/options/head(path, ...fns)` | same; `...fns` = route middleware + handler, chained |
| `app.use(fn)` / `app.use(path, fn)` | same, path-scoped middleware |
| `app.route(prefix, subApp)` | mount a sub **Hono** app (flattens into parent) |
| `app.notFound(fn)` / `app.onError(fn)` | same signatures |
| `app.on(method, path, ...fns)` / `app.all(path, ...fns)` | same; `on` accepts single/array method+path |
| `app.fire()` | no-op returning `this` (worker-runtime logging parity) |
| `app.request(path, opts)` / `app.serve(opts)` / `app.handler()` | ch3 equivalents |
| `c.req.param/query/queries/header/method/path/raw` | direct mapping |
| `c.req.parseBody()` / `c.req.json()` | `bodyJson()` — **sync, JSON only** |
| `c.req.text()` | `body()` — sync, buffered |
| `c.json/text/html/body/redirect`, `c.status`, `c.header`, `c.set/get`, `c.env`, `c.res` | direct mapping |
| `new Hono({ env })` | forwarded to `createRouter({ env })` |

## Divergences (the edge-shim caveat)

1. **No `Response` return.** Handlers return `void | HonoContext | JsonValue`,
   never `Response`. `c.json()` buffers straight to `res.end`. A handler
   returning any other foreign object is JSON-serialized at the edge as a
   last resort.
2. **No `app.fetch`.** `app.fetch()` exists only as a throwing stub —
   use `app.request()` (in-process test helper) or `app.serve()`.
3. **`c` is a facade**, not ch3's `Context` class — `c instanceof Context`
   is false; the real context is reachable as `c._c`.
4. **Linear middleware, not onion.** `next()` resumes the chain synchronously;
   code after `next()` still runs, but `await next()` is impossible.
5. **No ecosystem middleware.** `hono/cors`, `hono/jwt`, zod validators and
   everything fetch-typed does not port.
6. **No `c.executionCtx`, `c.var`, SSE/streaming helpers** (sync-only, always
   buffered bodies).
7. **`c.req.parseBody()` is sync JSON** — not async form-data parsing.
8. **`app.on()` rejects non-standard methods** (`'method not supported'`).
9. **`app.route()` mounts `Hono` apps only**; mount a raw `Ch3App` via
   `app._router.route(prefix, app)`.

## Async handlers

Async functions are rejected at wrap time:

```ts
app.get('/x', async (c) => c.json({}))
// → Error: async handlers unsupported under ch3
```

(Detect via `h.constructor.name === 'AsyncFunction'` — same for `use`,
`notFound`, `onError`.)
