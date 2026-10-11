# `ch3/express` — Express 4 API-compat shim

Coverage target: **~70% of JSON-API route code** (the heaviest shim per
DESIGN.md §4). Pure re-mapping over the ch3 core — zero code from express.

```ts
import * as express from '../shims/express.ts' // call-site parity
// or: import express, { Router, json, urlencoded, errorHandler } from ...

const app = express.express()       // import * as form
// const app = express()            // default-export form

app.use(express.json())             // or: app.use(json())

app.get('/users/:id', (req, res) => {
  res.json({ id: req.params['id'], q: req.query['q'] })
})

const api = express.Router()        // or: Router()
api.get('/health', (req, res) => res.json({ ok: true }))
app.mount('/api', api)              // scriptc-safe mount (see divergences)
// app.use('/api', api)             // works under plain node/tsc

app.use(errorHandler((err, req, res, next) => {
  res.status(500).json({ error: 'handled' })
}))

app.listen(8080)
```

## Surface

| Express | ch3 shim |
|---|---|
| `express()` | `express()` → `ExpressApp` |
| `app.get/post/put/delete/patch/options/head/all(path, ...fns)` | identical; fns may mix handlers and `errorHandler(...)` layers |
| `app.use([prefix], ...fns\|errlayers\|routers)` | identical under tsc/node — see divergence 1 |
| `app.route(path).get(...)` | `ExRouteBuilder` chain |
| `app.mount(prefix, router)` | explicit mount helper (scriptc-safe) |
| `express.Router()` | `Router()` → records items, replayed on mount (nested mounts OK) |
| `express.json()` / `express.urlencoded()` | `json()` / `urlencoded()` middleware |
| `app.listen(port[, cb])` | `serve()` sugar → `http.Server` |
| `app.set/setting/enable/disable/enabled/disabled` | settings map (`x-powered-by` honored; rest stored no-ops) |
| `app.locals` | plain record on the app |
| `req.params/query/path/method/headers/url/originalUrl/app/raw` | identical (`headers` lowercased) |
| `req.get(name)` | case-insensitive header lookup |
| `req.body` | `null` until `json()`/`urlencoded()` ran; `{}` for non-matching CT |
| `res.json/send/status/set/get/append/type/location/vary/links/locals/end/headersSent` | `locals` → context vars |
| `res.send` | string→text/plain, object→json, Buffer→octet-stream, null→end |
| `res.sendStatus(n)` | reason text from a local status table |
| `res.redirect([status,] url)` | 302 default |
| `next()` / `next(err)` / `next('route')` | linear continuation / error dispatch / resume-normal |

## Error middleware — IMPORTANT

`fn.length`/`fn.toString` are unlowered under scriptc, so 4-arity detection is
impossible. Tag error middleware with the exported `errorHandler(fn)`:

```ts
app.use(errorHandler((err, req, res, next) => { ... }))
app.get('/x', h1, errorHandler(errmw), h2)  // route-level too
```

Dispatch is real-express semantics: throw or `next(err)` skips normal layers
to the next error layer; bare `next()`, `next(err)` and throws inside an error
layer chain to the *next* error layer; only `next('route')` resumes normal
middleware. Unhandled errors → `500` (HttpError → its `.status`).

## Divergences (implemented — the documented promise)

1. **`app.use('/api', router)` can't box a class into `use()`'s union under
   scriptc** — use `app.mount('/api', router)` (identical semantics; `use`
   still accepts routers under plain tsc/node).
2. **4-arity error middleware needs `errorHandler(fn)` tagging** — passing a
   raw 4-arg fn to `use()` registers it as *normal* middleware.
3. `res.send(string)` → `text/plain` (express sends `text/html`).
4. `res.send(number)` sends the number as JSON (express treats it as status).
5. 404 text is `Cannot METHOD /path`; 405 + `Allow` on method mismatch
   (ch3 semantics); `HEAD` auto-dispatches the GET handler.
6. `req.query` is single-valued (`{k: string}`; no `?a=1&a=2` arrays — use
   `req._c.req.queries`).
7. `app.set`/`enable`/`disable` stored-but-no-op except `x-powered-by`.
8. No render/views/static/sendFile/download/attachment/cookie/jsonp/format —
   those methods **throw loudly** rather than silently diverging.
9. `app.listen(port[, cb])` — no hostname arg (use `app.handler()`/`serve`).
10. `req.body` is `null` (not `undefined`) pre-parser per subset rule;
    `urlencoded()` yields flat `{k: string}` (no nested objects).
