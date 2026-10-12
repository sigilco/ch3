# ch3 generated-dispatch contract (`src/gen.ts`)

Status: **frozen** — this is the seam between `ch3` (route table +
ctx machinery) and build-time code generators (the Vite/unplugin transform
agent emits modules satisfying this contract). v0.2.0, 2026-10-11.

## The seam in one paragraph

`app.withDispatch(d)` registers a generated dispatch object. On every
request, `app.serve()`/`app.handler()` calls `d.dispatch(req, res)` **first**.
`true` = the request is handled (or committed to be handled asynchronously
after a body-buffer); `false` = decline — ch3's internal specialized dispatch
takes over. Routes stay registered on `app` either way: the generated module
is a pure accelerator overlay, never a replacement for the route table.

## Module shape

```ts
import { GenDispatch } from 'ch3'

// Emit a CLASS, not an object literal. Under scriptc's eager
// program-code instantiation a function value inside a record
// instantiates the record as `unknown` and fences every call on it;
// class instances with methods compile cleanly. `extends GenDispatch`
// keeps the assignment nominal for both tsc and scriptc.
export class CompiledRoutes extends GenDispatch {
  dispatch(req: IncomingMessage, res: ServerResponse): boolean {
    // ... generated matcher ...
  }
}
```

Emitting code then wires it at app construction:

```ts
const app = createRouter()
app.withDispatch(new CompiledRoutes())
// app.get(...) calls still run — the route table stays the source of truth.
```

`GenDispatch` (from `src/gen.ts`, re-exported by `src/index.ts`):

```ts
export class GenDispatch {
  dispatch(req: IncomingMessage, res: ServerResponse): boolean {
    return false
  }
}
```

## Dispatch precedence — deterministic

1. `withDispatch` may be called at most once; a second call **replaces** the
   previous dispatch object (documented, deterministic — last wins).
2. Every request calls `dispatch` exactly once, before any internal work —
   including requests the generated module does not recognize.
3. `false` must only be returned **before** any response bytes, headers, or
   `req.on(...)` listeners are committed. Returning `false` after
   `setHeader`/`end`/body-listeners is a contract violation (undefined
   behavior, double-response).
4. Returning `true` after `app._buffer(...)` was invoked is correct even
   though the response completes later — the commitment is made at
   listener-attach time.
5. The internal dispatch never calls generated code; generated code never
   calls back into `App._dispatch`. One direction only.

## What generated code may use (the stable surface)

Everything below is a **contract member** — it will not change shape in 0.x
without a major-version note. Members not listed are private.

```ts
// Construction: the generated matcher already parses the URL for its own
// matching — pass the pieces through, no double-parse.
const rv = new ReqView(raw, qs, path)   // (req, query-string-w/o-?, path-w/o-?)
const c  = new Ctx(rv, res)

// Params: after the generated matcher binds a route with params, seed the
// lazy param store with decoded name/value pairs — flat array, pairs of 2.
rv._seedPm(['id', dec(segValue)])       // 'id' → param('id'), '*' for splat
// If nothing is seeded, param() materializes from the entry declared on
// the internal table (only when the internal dispatch ran) — generated
// routes that return true MUST seed their own params.

// Body: ONLY for routes the author declared `body: true` at registration.
app-free helper, attaches 'data'/'end', buffers, then runs k under the
// send500 guard. Returns void; dispatch() must still return true.
_buffer(req, res, c, function (): void { handler(c) })

// Guard: wrap synchronous handler execution with the standard 500 path.
_guard(res, function (): void { handler(c) })
```

| Export | Signature | Contract |
|--------|-----------|----------|
| `GenDispatch` | class, `dispatch(req,res): boolean` | subclass + override |
| `ReqView` | `new (raw, qs, path)` | qs/path already split at `?` |
| `ReqView._seedPm` | `(pm: string[]) => void` | flat decoded pairs incl `'*'` |
| `ReqView._setBody` | `(s: string) => void` | set by `_buffer` only |
| `Ctx` | `new (rv, res)` + `json/text/html/status/header/redirect` | unchanged authoring API |
| `App.withDispatch` | `(d: GenDispatch) => App` | last-wins, tried first per request |
| `_buffer` | `(req, res, c, k: () => void) => void` | data/end + `_setBody` + guarded `k` |
| `_guard` | `(res, k: () => void) => void` | `try { k() } catch → send500` |
| `dec` | `(s: string) => string` | `+`→space then `decodeURIComponent`, fallback raw |

## Body buffering — declared-body rule

The request body is buffered **only** when the route declared body use at
registration. This is a hard contract, not a hint:

```ts
app.post('/echo', (c) => c.text(c.req.body()), { body: true })
```

- `body: true` + a body-carrying method (`POST`/`PUT`/`PATCH`/`DELETE`) →
  body is buffered before the handler chain runs; `c.req.body()` returns it.
- `body: true` + `GET`/`HEAD`/etc → no buffering (flag ignored for
  non-carrying methods).
- No declaration → **no buffering, `c.req.body()` returns `''`** — on
  generated and internal dispatch alike. 404/notFound paths never buffer.
- A call-site marker (`ctx.body()` auto-detection) is **rejected**: handler
  introspection is impossible inside the subset (`fn.toString`/`fn.length`
  are SC2020) and would be non-deterministic across the two runtimes. The
  registration flag is the one way to do it.
- `maxBodyBytes` is **not** implemented in v0.2 — document if needed later.

## Rules for emitted code (scriptc subset — same as package internals)

The emitted module compiles into the user's program, so it lives under the
same subset rules as `src/`:

- Sync only. No `Promise`/`async` on the dispatch path.
- `null`, never `undefined`, in every union and return position.
- Class instances (not object literals) for `GenDispatch` impls.
- No function values inside records — generated tables hold `number`
  indices into a class-side `Handler[]` or emit static `if`/`switch`
  dispatch (both compile; `switch` on method strings and flat `if` chains
  are the recommended emit shapes).
- Indexed `for` loops; no `for…in`; no `?.` (use `&&`/`=== null`); no
  spread calls; no `new Function`/`eval`/`Object.create`.
- `String(x)`/`Number(x)` coercion at function entry for `unknown` params.
- `res.end(...)` statement-called. Body accumulation via
  `req.on('data', (c: Buffer) => …)` + `toString()` + `join`, or just call
  `_buffer`.
- `import type` / `.ts` specifiers / `for…of` over arrays / `instanceof`
  vs program classes / class getters / default params all compile clean.

## Versioning

The contract majors with the package: any change to a member listed in the
stable-surface table bumps minor at minimum and is recorded here. The
unplugin agent should pin `ch3` peer ranges accordingly.
