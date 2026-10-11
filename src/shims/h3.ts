// ch3/h3 — API-compat shim for unjs/h3 (event-object surface).
//
// Pure re-mapping layer: adapts h3-shaped apps/handlers onto the ch3 core
// (`createRouter` → App/Ctx/ReqView). Contains zero code from the real `h3`
// package — the real package cannot compile under scriptc at all (its entry
// is DOM-typed: Request/Response/Headers/FormData).
//
// Coverage target: ~80% of common h3 handler usage (DESIGN.md §4).
//
// Divergences vs real h3 (also in docs/shims/h3.md):
//   - Sync handlers only: `async` handlers throw
//     "async handlers unsupported under ch3" at wrap time.
//   - No nitro hooks/plugin lifecycle (`onRequest`/`onBeforeResponse`/`hooks`).
//   - No `event.node` adapter breadth beyond `req`/`res`; no ws/SSE utils.
//   - `app.handler` is the node listener `(req, res) => void`, not an
//     EventHandler — `toNodeListener(app)` returns the same thing.
//   - `app.use(router)` mounts by flattening the router's current routes into
//     the core app. All `use` middleware runs before route dispatch — in real
//     h3 the router sits in the stack at its registration position.
//   - `readBody(e)` parses JSON and throws H3Error(400) on non-JSON bodies;
//     real h3 falls back to the raw string. Use `readRawBody` for raw text.
//   - Bodies are buffered for write methods only (POST/PUT/PATCH/DELETE) —
//     `req.body()`/readBody on GET/HEAD/OPTIONS is ''.
//   - `event.context` is a plain record shared across the whole request
//     (middleware → route handler), carried per-request, not per-event-class.
//   - No `Request`/`Response`/`Headers` globals anywhere — h3 2.x is
//     fetch-shaped, this shim is node-http-shaped.

import * as http from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRouter as createCoreRouter } from '../index.ts'
import type { App, Ctx, Handler, Middleware, Next } from '../index.ts'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type EventHandler = (event: H3Event) => unknown
export type EventHandlerResponse = unknown
export type NodeListener = (req: IncomingMessage, res: ServerResponse) => void
export type H3UseArg = string | EventHandler | H3Router

export class H3Error extends Error {
  statusCode: number
  statusMessage: string | null
  data: unknown
  fatal: boolean
  unhandled: boolean

  constructor(message: string) {
    super(message)
    this.name = 'H3Error'
    this.statusCode = 500
    this.statusMessage = null
    this.data = null
    this.fatal = false
    this.unhandled = false
  }
}

// ---------------------------------------------------------------------------
// H3Event — wraps the ch3 Ctx for one request. `event.context` is a plain
// record shared by every H3Event created for the same IncomingMessage (the
// request-scoped vars bag; see `eventFor` below).
// ---------------------------------------------------------------------------

export class H3Event {
  readonly _c: Ctx
  readonly node: { req: IncomingMessage; res: ServerResponse }
  readonly context: { [k: string]: unknown }
  readonly path: string
  readonly method: string
  _responded: boolean

  constructor(c: Ctx) {
    this._c = c
    this.node = { req: c.req.raw, res: c.res }
    this.context = bagFor(c.req.raw)
    this.path = c.req.path
    this.method = c.req.method
    this._responded = false
  }
}

// ch3 dispatch is fully synchronous once the body is buffered: between a
// middleware and its downstream handler no other request can interleave.
// So a single "current request" slot keyed by the IncomingMessage identity
// is enough to share event.context across the whole chain.
let _curRaw: IncomingMessage | null = null
let _curBag: { [k: string]: unknown } = {}

function bagFor(raw: IncomingMessage): { [k: string]: unknown } {
  if (_curRaw !== raw) {
    _curRaw = raw
    _curBag = {}
  }
  return _curBag
}

// ---------------------------------------------------------------------------
// Handler adaptation
// ---------------------------------------------------------------------------

function assertSync(h: EventHandler): void {
  if (h.constructor.name === 'AsyncFunction') {
    throw new Error('async handlers unsupported under ch3')
  }
}

// Returns true when a response has been (or should be considered) produced.
function marshal(ret: unknown, c: Ctx): boolean {
  if (ret === null || ret === undefined) return false
  if (typeof ret === 'string') {
    c.text(ret)
    return true
  }
  if (typeof ret === 'number' || typeof ret === 'boolean') {
    c.text(String(ret))
    return true
  }
  if (typeof ret === 'object' || typeof ret === 'function') {
    c.json(ret)
    return true
  }
  return false
}

function errRecord(err: H3Error): { [k: string]: unknown } {
  const out: { [k: string]: unknown } = {}
  out['statusCode'] = err.statusCode
  if (err.statusMessage !== null) out['statusMessage'] = err.statusMessage
  if (err.message !== '') out['message'] = err.message
  return out
}

// Writes an H3Error response; returns false for non-H3Error throwables so the
// caller can rethrow into the core's send500 path.
function writeError(e: H3Event, err: unknown): boolean {
  if (err instanceof H3Error) {
    const c = e._c
    c.status(err.statusCode)
    c.json(errRecord(err))
    e._responded = true
    return true
  }
  return false
}

// Runs one EventHandler over an event; returns true when the request was
// answered (value returned, error handled, or res already ended).
function runHandler(h: EventHandler, e: H3Event): boolean {
  const c = e._c
  let ret: unknown = null
  try {
    ret = h(e)
  } catch (err) {
    if (writeError(e, err)) return true
    throw err
  }
  if (marshal(ret, c)) {
    e._responded = true
    return true
  }
  if (e.node.res.headersSent || e._responded) return true
  return false
}

// Adapt an EventHandler into a terminal core Handler. An `undefined` return
// ends the response empty (h3's matched-route fallback), unlike middleware
// where it means "continue".
function adapt(h: EventHandler): Handler {
  assertSync(h)
  const wrapped: Handler = (c: Ctx): void => {
    const e = new H3Event(c)
    const done: boolean = runHandler(h, e)
    if (!done && !e.node.res.headersSent) {
      c.res.end()
    }
  }
  return wrapped
}

function prefixMatch(path: string, prefix: string): boolean {
  if (prefix === '' || prefix === '/') return true
  if (path === prefix) return true
  return path.indexOf(prefix + '/') === 0
}

function joinPath(prefix: string, path: string): string {
  let p: string = prefix
  if (p.length > 1 && p.charAt(p.length - 1) === '/') {
    p = p.substring(0, p.length - 1)
  }
  if (p === '/' || p === '') return path
  return p + path
}

// ---------------------------------------------------------------------------
// App facade
// ---------------------------------------------------------------------------

export class H3App {
  readonly _app: App
  readonly handler: NodeListener
  readonly options: { [k: string]: unknown }
  _usePaths: string[]
  _useFns: EventHandler[]

  constructor() {
    this._app = createCoreRouter()
    this.handler = this._app.handler()
    this.options = {}
    this._usePaths = []
    this._useFns = []
    const self: H3App = this
    const dispatcher: Middleware = (c: Ctx, next: Next): void => {
      self._dispatch(c, next)
    }
    this._app.use(dispatcher)
    // Snapshot _nfmw with the dispatcher included so `use` handlers also run
    // on unmatched (404) paths, matching h3 stack semantics.
    this._app.notFound((c: Ctx): void => {
      if (!c.res.headersSent) {
        c.status(404)
        c.text('Not Found')
      }
    })
  }

  // Ordered list of use-entries; each matching handler runs until one
  // produces a response, then the chain stops (h3 stack semantics).
  _dispatch(c: Ctx, next: Next): void {
    const path: string = c.req.path
    const n: number = this._useFns.length
    if (n === 0) {
      next()
      return
    }
    const e: H3Event = new H3Event(c)
    for (let i: number = 0; i < n; i++) {
      const pre: string = this._usePaths[i]
      if (!prefixMatch(path, pre)) continue
      const h: EventHandler = this._useFns[i]
      if (runHandler(h, e)) return
    }
    next()
  }

  _addRoute(method: string, path: string, h: EventHandler): void {
    this._app.on(method, path, adapt(h))
  }

  _mountRouter(r: H3Router, prefix: string): void {
    const n: number = r._fns.length
    for (let i: number = 0; i < n; i++) {
      this._addRoute(r._methods[i], joinPath(prefix, r._paths[i]), r._fns[i])
    }
    r._apps.push(this)
    r._prefixes.push(prefix)
  }

  use(h: EventHandler): H3App
  use(path: string, h: EventHandler): H3App
  use(router: H3Router): H3App
  use(path: string, router: H3Router): H3App
  use(...args: H3UseArg[]): H3App {
    let prefix: string = ''
    const fns: EventHandler[] = []
    const routers: H3Router[] = []
    for (const a of args) {
      if (typeof a === 'string') {
        prefix = a
      } else if (a instanceof H3Router) {
        routers.push(a)
      } else {
        const h: EventHandler = a
        fns.push(h)
      }
    }
    for (const r of routers) {
      this._mountRouter(r, prefix)
    }
    for (const h of fns) {
      assertSync(h)
      this._usePaths.push(prefix)
      this._useFns.push(h)
    }
    return this
  }
}

export function createApp(): H3App {
  return new H3App()
}

export function toNodeListener(app: H3App): NodeListener {
  return app.handler
}

// ---------------------------------------------------------------------------
// Router facade — rou3-shaped: method helpers + add + use (all-method route).
// Routes added before AND after app.use(router) propagate (mount registry).
// ---------------------------------------------------------------------------

export class H3Router {
  _methods: string[]
  _paths: string[]
  _fns: EventHandler[]
  _apps: H3App[]
  _prefixes: string[]

  constructor() {
    this._methods = []
    this._paths = []
    this._fns = []
    this._apps = []
    this._prefixes = []
  }

  _add(method: string, path: string, h: EventHandler): H3Router {
    assertSync(h)
    if (this._apps.length === 0) {
      this._methods.push(method)
      this._paths.push(path)
      this._fns.push(h)
      return this
    }
    const n: number = this._apps.length
    for (let i: number = 0; i < n; i++) {
      this._apps[i]._addRoute(method, joinPath(this._prefixes[i], path), h)
    }
    return this
  }

  add(path: string, method: string, h: EventHandler): H3Router {
    return this._add(String(method).toUpperCase(), path, h)
  }

  get(path: string, h: EventHandler): H3Router {
    return this._add('GET', path, h)
  }
  post(path: string, h: EventHandler): H3Router {
    return this._add('POST', path, h)
  }
  put(path: string, h: EventHandler): H3Router {
    return this._add('PUT', path, h)
  }
  delete(path: string, h: EventHandler): H3Router {
    return this._add('DELETE', path, h)
  }
  patch(path: string, h: EventHandler): H3Router {
    return this._add('PATCH', path, h)
  }
  head(path: string, h: EventHandler): H3Router {
    return this._add('HEAD', path, h)
  }
  options(path: string, h: EventHandler): H3Router {
    return this._add('OPTIONS', path, h)
  }
  use(path: string, h: EventHandler): H3Router {
    return this._add('*', path, h)
  }
}

export function createRouter(): H3Router {
  return new H3Router()
}

// ---------------------------------------------------------------------------
// Handler factories
// ---------------------------------------------------------------------------

export function defineEventHandler(h: EventHandler): EventHandler {
  assertSync(h)
  return h
}

export function eventHandler(h: EventHandler): EventHandler {
  return defineEventHandler(h)
}

export function isEventHandler(h: unknown): boolean {
  return typeof h === 'function'
}

export function defineRequestMiddleware(h: EventHandler): EventHandler {
  return defineEventHandler(h)
}

export function defineResponseMiddleware(h: EventHandler): EventHandler {
  return defineEventHandler(h)
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

export function getRouterParam(e: H3Event, name: string): string | null {
  return e._c.req.param(name)
}

export function getQuery(e: H3Event): { [k: string]: string } {
  return e._c.req.queryAll()
}

export function getRequestQuery(e: H3Event): { [k: string]: string } {
  return getQuery(e)
}

export function getMethod(e: H3Event): string {
  return e.method
}

export function getRequestPath(e: H3Event): string {
  return e.path
}

export function getRequestHost(e: H3Event): string {
  const h: string | null = reqHeader(e, 'host')
  if (h === null) return 'localhost'
  return h
}

export function getRequestURL(e: H3Event): URL {
  const host: string = getRequestHost(e)
  const qs: string = e._c.req._qs
  let p: string = e.path
  if (qs !== '') p = p + '?' + qs
  try {
    return new URL(p, 'http://' + host)
  } catch (err) {
    return new URL('http://' + host + '/')
  }
}

export function getRequestIP(e: H3Event): string | null {
  const a: string | undefined = e.node.req.socket.remoteAddress
  if (typeof a === 'string') return a
  return null
}

// Reads a request header straight off the raw IncomingMessage. Equivalent
// to `c.req.header` but avoids a latent core narrowing fence (index.ts:87).
function reqHeader(e: H3Event, name: string): string | null {
  const v: unknown = e.node.req.headers[String(name).toLowerCase()]
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  if (v === null || v === undefined) return null
  return String(v)
}

export function getRequestHeader(e: H3Event, name: string): string | null {
  return reqHeader(e, name)
}

export function getHeader(e: H3Event, name: string): string | null {
  return getRequestHeader(e, name)
}

// h3: await readBody(e) → parsed body, JSON when content-type is JSON else the
// raw string. Under ch3 the body is pre-buffered; malformed JSON throws
// H3Error(400) — real h3's unstorage layer falls back to raw on some inputs.
export function readBody(e: H3Event): unknown {
  const raw: string = e._c.req.body()
  const ct: string | null = reqHeader(e, 'content-type')
  if (ct !== null && ct.indexOf('json') !== -1) {
    try {
      const v: unknown = JSON.parse(raw)
      return v
    } catch (err) {
      const he: H3Error = new H3Error('Invalid JSON body')
      he.statusCode = 400
      throw he
    }
  }
  return raw
}

export function readRawBody(e: H3Event): string {
  return e._c.req.body()
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

export function setResponseStatus(e: H3Event, code: number, text: string | null = null): void {
  e._c.status(code)
  if (text !== null) {
    e._c.res.statusMessage = text
  }
}

export function setResponseHeader(e: H3Event, name: string, value: string): void {
  e._c.header(name, value)
}

export function getResponseHeader(e: H3Event, name: string): string | null {
  const v = e._c.res.getHeader(name)
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  return null
}

export function setResponseHeaders(e: H3Event, headers: { [k: string]: string }): void {
  const keys: string[] = Object.keys(headers)
  for (const k of keys) {
    e._c.header(k, headers[k])
  }
}

export function appendResponseHeader(e: H3Event, name: string, value: string): void {
  const prev: string | null = getResponseHeader(e, name)
  if (prev === null) {
    e._c.header(name, value)
  } else {
    e._c.header(name, prev + ', ' + value)
  }
}

export function removeResponseHeader(e: H3Event, name: string): void {
  e._c.res.removeHeader(name)
}

// h3: send(e, data, type?) — writes the response body and ends it.
export function send(e: H3Event, data: unknown, type: string | null = null): void {
  const c = e._c
  if (type !== null) c.header('content-type', type)
  if (data === null || data === undefined) {
    c.res.end()
    e._responded = true
    return
  }
  if (typeof data === 'string') {
    c.text(data)
  } else if (typeof data === 'number' || typeof data === 'boolean') {
    c.text(String(data))
  } else {
    c.json(data)
  }
  e._responded = true
}

export function sendNoContent(e: H3Event): void {
  e._c.status(204)
  e._c.res.end()
  e._responded = true
}

export function sendRedirect(e: H3Event, location: string, code: number = 302): void {
  e._c.redirect(location, code)
  e._responded = true
}

export function sendError(e: H3Event, error: unknown, debug: boolean = false): void {
  if (writeError(e, error)) return
  const c = e._c
  c.status(500)
  const out: { [k: string]: unknown } = {}
  out['statusCode'] = 500
  out['statusMessage'] = 'Internal Server Error'
  if (debug) out['stack'] = String(error)
  c.json(out)
  e._responded = true
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export function createError(input: { [k: string]: unknown } | string | number | null): H3Error {
  if (typeof input === 'object' && input !== null && input instanceof H3Error) {
    return input
  }
  const err: H3Error = new H3Error('')
  if (input === null) {
    return err
  }
  if (typeof input === 'string') {
    err.message = input
    return err
  }
  if (typeof input === 'number') {
    err.statusCode = Math.trunc(input)
    return err
  }
  if (typeof input === 'object') {
    const o: { [k: string]: unknown } = input
    const sc = o['statusCode']
    if (typeof sc === 'number') err.statusCode = Math.trunc(sc)
    const st = o['status']
    if (typeof st === 'number') err.statusCode = Math.trunc(st)
    const sm = o['statusMessage']
    if (typeof sm === 'string') err.statusMessage = sm
    const m = o['message']
    if (typeof m === 'string') err.message = m
    const d = o['data']
    if (d !== null && d !== undefined) err.data = d
    const f = o['fatal']
    if (typeof f === 'boolean') err.fatal = f
    const u = o['unhandled']
    if (typeof u === 'boolean') err.unhandled = u
    return err
  }
  return err
}

export function isError(e: unknown): boolean {
  return e instanceof H3Error
}

export function isMethod(e: H3Event, expected: string): boolean {
  return e.method === String(expected).toUpperCase()
}

export function assertMethod(e: H3Event, expected: string, allowHead: boolean = true): void {
  const want: string = String(expected).toUpperCase()
  if (e.method === want) return
  if (allowHead && want === 'GET' && e.method === 'HEAD') return
  const err: H3Error = new H3Error('method not allowed')
  err.statusCode = 405
  throw err
}

// ---------------------------------------------------------------------------
// Cookies
// ---------------------------------------------------------------------------

export function parseCookies(e: H3Event): { [k: string]: string } {
  const out: { [k: string]: string } = {}
  const h: string | null = reqHeader(e, 'cookie')
  if (h === null) return out
  const parts: string[] = h.split(';')
  for (const part of parts) {
    const eq: number = part.indexOf('=')
    if (eq < 0) continue
    const k: string = part.substring(0, eq).trim()
    const v: string = part.substring(eq + 1).trim()
    if (k === '') continue
    try {
      out[k] = decodeURIComponent(v)
    } catch (err) {
      out[k] = v
    }
  }
  return out
}

export function getCookie(e: H3Event, name: string): string | null {
  const all: { [k: string]: string } = parseCookies(e)
  const v = all[name]
  if (typeof v === 'undefined') return null
  return v
}

export function setCookie(e: H3Event, name: string, value: string, opts: { [k: string]: unknown } | null = null): void {
  let enc: string = value
  try {
    enc = encodeURIComponent(value)
  } catch (err) {
    enc = value
  }
  let s: string = name + '=' + enc
  if (opts !== null) {
    const p = opts['path']
    if (typeof p === 'string') s = s + '; Path=' + p
    const ma = opts['maxAge']
    if (typeof ma === 'number') s = s + '; Max-Age=' + String(Math.trunc(ma))
    const ex = opts['expires']
    if (typeof ex === 'string') s = s + '; Expires=' + ex
    const dm = opts['domain']
    if (typeof dm === 'string') s = s + '; Domain=' + dm
    const ss = opts['sameSite']
    if (typeof ss === 'string') s = s + '; SameSite=' + ss
    const ho = opts['httpOnly']
    if (ho === true) s = s + '; HttpOnly'
    const se = opts['secure']
    if (se === true) s = s + '; Secure'
  }
  // scriptc's ServerResponse.setHeader has no `string[]` overload, so
  // repeated setCookie calls on one response keep only the last value
  // (documented divergence; real h3 emits one header per cookie).
  e._c.res.setHeader('set-cookie', s)
}

export function deleteCookie(e: H3Event, name: string, opts: { [k: string]: unknown } | null = null): void {
  const o: { [k: string]: unknown } = {}
  if (opts !== null) {
    const keys: string[] = Object.keys(opts)
    for (const k of keys) {
      o[k] = opts[k]
    }
  }
  o['maxAge'] = 0
  setCookie(e, name, '', o)
}
