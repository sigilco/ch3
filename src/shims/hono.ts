// ch3/hono — API-compat shim for `hono` route files.
//
// Pure re-mapping surface: adapts hono-shaped `new Hono()` apps onto the ch3
// core (`createRouter`). No code from the real `hono` package is bundled or
// executed. Coverage target: ~75% of route-file code (app.METHOD, use, route,
// notFound/onError, c.req.*, c.json/text/html/redirect, c.set/get, c.env).
//
// Divergences (the "edge-shim caveat", also in docs/shims/hono.md):
//   - Handlers return `void | HonoContext | JsonValue`, NOT `Response`
//     (there is no fetch/Response world under ch3). `c.json()` buffers
//     straight to `res.end`. A handler returning any other foreign object is
//     JSON-serialized at the edge as a last resort.
//   - `app.fetch` does not exist — use `app.request()` (test helper) or
//     `app.serve()`/`app.handler()`.
//   - `c` is a thin facade over ch3's `Context`, not the same class.
//   - Middleware is a linear chain, not hono's async onion: sync post-`next()`
//     code still runs, but `await next()` is impossible.
//   - No `c.executionCtx`, `c.var`, SSE/streaming helpers, or fetch-typed
//     middleware ecosystem imports (cors/jwt/zod).
//   - `c.req.parseBody()` is synchronous JSON-only (`bodyJson`), not
//     promise/async form-data parsing.
//   - `app.on()` accepts registered HTTP methods only (no custom verbs).
//   - Async handlers throw "async handlers unsupported under ch3" at wrap time.

import * as http from 'node:http'
import { createRouter } from '../index.ts'
import { HttpError } from '../index.ts'
import type {
  Ch3App,
  Ch3Request,
  Context,
  ContextValue,
  Handler,
  JsonValue,
  Next,
} from '../index.ts'

export { HttpError }
export type { ContextValue, JsonValue, Next }

// A hono-shaped handler. Real hono handlers return `Response | void`; under
// ch3 they return `void | HonoContext`, or any JSON-serializable value which is
// written out as a JSON response at the edge (last resort).
export type HonoHandler = (
  c: HonoContext,
  next: Next,
) => void | HonoContext | JsonValue

export type HonoNotFoundHandler = (
  c: HonoContext,
) => void | HonoContext | JsonValue

export type HonoErrorHandler = (
  err: HttpError | Error,
  c: HonoContext,
) => void | HonoContext | JsonValue

export interface HonoOptions {
  env: { [k: string]: ContextValue } | null
}

export interface HonoServeOptions {
  port: number
  hostname: string | null
  maxBodyBytes: number | null
}

export interface HonoRequestOptions {
  method: string | null
  body: string | null
  headers: { [k: string]: string } | null
}

const ALL_METHODS: string[] = [
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'OPTIONS',
  'HEAD',
]

function assertSync(h: HonoHandler): void {
  if (h.constructor.name === 'AsyncFunction') {
    throw new Error('async handlers unsupported under ch3')
  }
}

// Hono's `c.req` surface mapped onto ch3's Ch3Request.
export class HonoRequest {
  readonly _r: Ch3Request
  readonly raw: http.IncomingMessage
  readonly method: string
  readonly path: string

  constructor(r: Ch3Request) {
    this._r = r
    this.raw = r.raw
    this.method = r.method
    this.path = r.path
  }

  param(name: string): string | null {
    return this._r.param(name)
  }

  query(name: string): string | null {
    return this._r.query(name)
  }

  queries(name: string): string[] {
    return this._r.queries(name)
  }

  header(name: string): string | null {
    return this._r.header(name)
  }

  // hono: await c.req.parseBody() → parsed body (usually form fields).
  // ch3: synchronous, JSON only.
  parseBody(): JsonValue {
    return this._r.bodyJson()
  }

  // hono: await c.req.json() → parsed JSON body.
  json(): JsonValue {
    return this._r.bodyJson()
  }

  // hono: await c.req.text() → raw body string.
  text(): string {
    return this._r.body()
  }
}

// Hono's `c` facade over ch3's Context. Member-for-member mapping; the
// underlying context stays reachable as `c._c` (escape hatch).
export class HonoContext {
  readonly _c: Context
  readonly req: HonoRequest
  readonly res: http.ServerResponse
  readonly env: { [k: string]: ContextValue }

  constructor(c: Context) {
    this._c = c
    this.req = new HonoRequest(c.req)
    this.res = c.res
    this.env = c.env
  }

  get sent(): boolean {
    return this._c.sent
  }

  status(n: number): HonoContext {
    this._c.status(n)
    return this
  }

  header(k: string, v: string): HonoContext {
    this._c.header(k, v)
    return this
  }

  // hono c.json(obj, status?) — ch3 statuses are set via c.status() first.
  json(obj: JsonValue): HonoContext {
    this._c.json(obj)
    return this
  }

  text(s: string): HonoContext {
    this._c.text(s)
    return this
  }

  html(s: string): HonoContext {
    this._c.html(s)
    return this
  }

  body(b: Buffer | string): HonoContext {
    this._c.body(b)
    return this
  }

  redirect(url: string, code: number | null = null): HonoContext {
    this._c.redirect(url, code === null ? 302 : code)
    return this
  }

  set(k: string, v: ContextValue): void {
    this._c.set(k, v)
  }

  get(k: string): ContextValue | null {
    return this._c.get(k)
  }
}

// Coerce whatever a hono handler produced into the ch3 Handler contract:
// null/undefined → nothing; a HonoContext → already wrote (or is chaining);
// anything else → JSON-serialize at the edge as a last resort.
function finish(out: void | HonoContext | JsonValue, c: Context): void {
  if (out === null || typeof out === 'undefined') {
    return
  }
  if (out instanceof HonoContext) {
    return
  }
  if (!c.sent) {
    c.json(out)
  }
}

function adaptHandler(h: HonoHandler): Handler {
  assertSync(h)
  const wrapped: Handler = (c: Context, next: Next) => {
    const hc = new HonoContext(c)
    const out = h(hc, next)
    finish(out, c)
    return c
  }
  return wrapped
}

function adaptAll(fns: HonoHandler[]): Handler[] {
  const out: Handler[] = []
  for (let i = 0; i < fns.length; i++) {
    out.push(adaptHandler(fns[i]))
  }
  return out
}

// Serialize a handler list into ONE Handler: scriptc cannot lower spread
// calls (`app.get(path, ...fns)`), so route middleware is chained inside a
// single entry — mw[0] → next() → mw[1] → … → handler → outer next().
function chainHandlers(fns: Handler[]): Handler {
  const wrapped: Handler = (c: Context, next: Next) => {
    let i = 0
    const inner: Next = () => {
      if (i >= fns.length) {
        next()
        return
      }
      const h = fns[i]
      i = i + 1
      h(c, inner)
    }
    inner()
    return c
  }
  return wrapped
}

export class Hono {
  // The underlying ch3 app. Exposed (not private) so `app.route()` can mount
  // sibling Hono instances and embedders can reach the ch3 surface.
  readonly _router: Ch3App

  constructor(init: HonoOptions | null = null) {
    let env: { [k: string]: ContextValue } = {}
    if (init !== null && init.env !== null) {
      env = init.env
    }
    this._router = createRouter({ env: env })
  }

  private _add(method: string, path: string, fns: HonoHandler[]): Hono {
    const adapted = adaptAll(fns)
    if (adapted.length === 0) {
      throw new Error('app.' + method + ': at least one handler required')
    }
    const h = chainHandlers(adapted)
    if (method === 'GET') {
      this._router.get(path, h)
    } else if (method === 'POST') {
      this._router.post(path, h)
    } else if (method === 'PUT') {
      this._router.put(path, h)
    } else if (method === 'DELETE') {
      this._router.delete(path, h)
    } else if (method === 'PATCH') {
      this._router.patch(path, h)
    } else if (method === 'OPTIONS') {
      this._router.options(path, h)
    } else if (method === 'HEAD') {
      this._router.head(path, h)
    } else {
      throw new Error('method not supported under ch3: ' + method)
    }
    return this
  }

  get(path: string, ...fns: HonoHandler[]): Hono {
    return this._add('GET', path, fns)
  }

  post(path: string, ...fns: HonoHandler[]): Hono {
    return this._add('POST', path, fns)
  }

  put(path: string, ...fns: HonoHandler[]): Hono {
    return this._add('PUT', path, fns)
  }

  delete(path: string, ...fns: HonoHandler[]): Hono {
    return this._add('DELETE', path, fns)
  }

  patch(path: string, ...fns: HonoHandler[]): Hono {
    return this._add('PATCH', path, fns)
  }

  options(path: string, ...fns: HonoHandler[]): Hono {
    return this._add('OPTIONS', path, fns)
  }

  head(path: string, ...fns: HonoHandler[]): Hono {
    return this._add('HEAD', path, fns)
  }

  all(path: string, ...fns: HonoHandler[]): Hono {
    for (let i = 0; i < ALL_METHODS.length; i++) {
      this._add(ALL_METHODS[i], path, fns)
    }
    return this
  }

  // hono app.on(method | method[], path | path[], ...handlers)
  on(
    method: string | string[],
    path: string | string[],
    ...fns: HonoHandler[]
  ): Hono {
    const methods: string[] = Array.isArray(method) ? method : [method]
    const paths: string[] = Array.isArray(path) ? path : [path]
    for (let i = 0; i < methods.length; i++) {
      for (let j = 0; j < paths.length; j++) {
        this._add(methods[i].toUpperCase(), paths[j], fns)
      }
    }
    return this
  }

  // hono app.use(...handlers) | app.use(path, ...handlers). Registered one
  // call at a time — spread calls don't lower under scriptc; consecutive
  // use(path, mw) calls compose to the same chain anyway.
  use(...args: (string | HonoHandler)[]): Hono {
    let prefix: string | null = null
    for (let i = 0; i < args.length; i++) {
      const a = args[i]
      if (typeof a === 'string') {
        prefix = a
      } else if (prefix === null) {
        this._router.use(adaptHandler(a))
      } else {
        this._router.use(prefix, adaptHandler(a))
      }
    }
    return this
  }

  // Mount another Hono app under a path prefix. To mount a raw ch3 app,
  // reach for the escape hatch: `app._router.route(prefix, ch3App)`.
  route(prefix: string, sub: Hono): Hono {
    this._router.route(prefix, sub._router)
    return this
  }

  notFound(h: HonoNotFoundHandler): Hono {
    if (h.constructor.name === 'AsyncFunction') {
      throw new Error('async handlers unsupported under ch3')
    }
    const wrapped: (c: Context) => void | Context = (c: Context) => {
      const out = h(new HonoContext(c))
      finish(out, c)
      return c
    }
    this._router.notFound(wrapped)
    return this
  }

  onError(h: HonoErrorHandler): Hono {
    if (h.constructor.name === 'AsyncFunction') {
      throw new Error('async handlers unsupported under ch3')
    }
    const wrapped: (err: HttpError | Error, c: Context) => void | Context = (
      err: HttpError | Error,
      c: Context,
    ) => {
      const out = h(err, new HonoContext(c))
      finish(out, c)
      return c
    }
    this._router.onError(wrapped)
    return this
  }

  // hono's fire() logs registered routes for worker runtimes. Under ch3 there
  // is no worker runtime — kept as a no-op returning this for call-site parity.
  fire(): Hono {
    return this
  }

  // No fetch API under ch3: no Request/Response globals exist in the compiled
  // world. Kept as a throwing stub so a leftover `export default app` fetch
  // path fails loudly instead of silently.
  fetch(): void {
    throw new Error(
      'app.fetch is not supported under ch3 — use app.request() or app.serve()',
    )
  }

  // In-process test helper: ephemeral serve + one fetch + close.
  request(path: string, opts: HonoRequestOptions | null = null): Promise<unknown> {
    return this._router.request(path, opts)
  }

  handler(): (req: http.IncomingMessage, res: http.ServerResponse) => void {
    return this._router.handler()
  }

  serve(opts: HonoServeOptions): http.Server {
    return this._router.serve(opts)
  }
}

export default Hono
