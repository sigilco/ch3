# @sigilco/ch3

Minimal synchronous HTTP router for `node:http`, authored inside the **scriptc
compilable subset**: the whole package lowers statically into a native ELF via
`scriptc build --npm-static @sigilco/ch3` with **zero deferred sites** (verified
100% static coverage on scriptc 0.2.8). Zero runtime dependencies.

```ts
import { createRouter } from '@sigilco/ch3'

const app = createRouter()

app.get('/json', (c) => c.json({ hello: 'world' }))
app.get('/user/:id', (c) => c.json({ id: c.req.param('id') }))   // 'id' is literal-typed
app.post('/echo', (c) => c.text(c.req.body()))
app.notFound((c) => c.status(404).text('not found'))

app.serve({ port: 3000 })
```

## API

- `createRouter()` → `App`
- Routing: `app.get|post|put|delete|patch|head|options(path, h)`, `app.all(path, h)`,
  `app.on(method, path, h)` — paths support static segments, `:param`, and a
  tail `*` wildcard (`c.req.param('*')`).
- `app.use(fn)` — sync middleware `(c, next) => void`; applies to routes
  registered **after** it (snapshot semantics).
- `app.notFound(h)` — custom 404.
- `app.route(prefix, subApp)` — mount a sub-router; merges parent + sub
  middleware.
- `app.handler()` → `(req, res) => void` node:http listener;
  `app.serve({ port })` / `app.serve({ port, host })` sugar returning `http.Server`.
- Context `c`: `c.req.param(name) → string | null` (percent-decoded),
  `c.req.query(name) → string | null`, `c.req.queryAll() → Record<string,string>`,
  `c.req.header(name) → string | null`, `c.req.body() → string`,
  `c.req.method`, `c.req.path`, `c.req.raw`.
- Responses (statement-level writes to `res`, all return `c` for chaining):
  `c.json(o)`, `c.text(s)`, `c.html(s)`, `c.status(n)`, `c.header(k, v)`,
  `c.redirect(url)` / `c.redirect(url, code)`.

### Semantics & deviations

- Handlers are **synchronous**: `(c) => void`. `c.req.body()` is synchronous
  because dispatch pre-buffers the request body (`data`/`end` concat) for
  POST/PUT/PATCH/DELETE before invoking the chain; other methods dispatch
  immediately.
- `query(name|all)` from the API sketch is split into `query(name)` and
  `queryAll()` to keep return types concrete.
- `param()` returns `string | null`; values are percent-decoded.
- `HEAD` requests fall back to a `GET` handler (node suppresses the body).
- Exact `method`+`path` duplicates: first registered wins. Path match is
  strict (no trailing-slash normalization).
- Handler exceptions → `500 Internal Server Error` (or socket destroy once
  headers are sent).
- Params are typed from the path literal via `ParamKey<P>`
  (`'/user/:id'` → `param('id')`); param-less paths degrade to `string`.
- Non-goals for v0: async handlers, streaming/SSE, WebSocket,
  constraint/versioned routing — no stubs; open seams.

## The subset (why this compiles)

The implementation obeys the verified scriptc rules — see the header comment
in `src/index.ts`: `| null` unions only, plain records for route data (no
function values inside records — handlers live in `App._fns` and nodes carry
indices), indexed loops, `String()`/`Number()` coercion at function entry,
no recursion for matching (explicit frame stack), no `slice`/`concat`/spread
on package paths, statement-called `res.end()`.

## Build & test

```sh
npm run build     # tsc → dist/esm (ESM+d.ts) and dist/cjs (CJS)
npm test          # node --test test/
```

## Compile to a native binary

```sh
cd demo && npm i
scriptc build demo/app.js --npm-static @sigilco/ch3 --optimization=speed -o demo/app-bin
./demo/app-bin 3000
```

Demo routes: `/json`, `/user/:id`, `/q?x=`, `/wild/*`, `POST /echo`, `/redir`.
