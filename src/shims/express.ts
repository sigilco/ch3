// ch3/express — API-compat shim for `express` route files.
//
// Pure re-mapping surface: adapts express-shaped `express()` apps onto the ch3
// core (`createRouter`). No code from the real `express` package is bundled or
// executed. Coverage target: ~70% of JSON-API route code.
//
// Surface:
//   express()                  → ExpressApp {get,post,put,delete,patch,options,
//                                head,all,use,route,set,enable,disable,enabled,
//                                disabled,setting,listen,locals}
//   express.Router() → Router()   named export (no function statics in subset)
//   express.json()   → json()     named export; JSON body-parser middleware
//   express.urlencoded() → urlencoded()  named export; form body-parser
//   errorHandler(fn) → tags a 4-arity fn as error middleware (see below)
//
// Divergences (also in docs/shims/express.md):
//   - `fn.length` does not exist under scriptc, so express's automatic
//     4-arity error-middleware detection is impossible. Tag error middleware
//     explicitly: `app.use(errorHandler((err,req,res,next) => {...}))`.
//     Plain 4-arity fns do not typecheck — wrap them or they are rejected.
//   - `express.Router`/`express.json`/… are named exports, not properties on
//     the factory (function statics can't be built under the subset). Use
//     `import * as express from 'ch3/express'` for call-site parity.
//   - Middleware all run before route handlers (ch3 linear core). Express code
//     that registers middleware AFTER a route relies on stack order ch3
//     cannot reproduce; post-route `use()` middleware DO run when the request
//     falls through (route handler calls next() / no route matches).
//   - Method-mismatch is 405 + Allow (ch3), not express's fallthrough 404.
//   - res.send(string) → text/plain (ch3 c.text), not express's text/html.
//   - req.query is flat last-wins (no qs nested `a[b]=c` syntax).
//   - No render/view engines, sendFile/sendfile/download/attachment/jsonp,
//     cookie/session helpers, express.static, app.param/engine — present as
//     throwing stubs or absent.
//   - app.set stores keys but most are no-ops; 'x-powered-by' is honored.
//   - next('route') ends the current route's fn list; there is no next-match.
//   - req.body is null unless a body-parser middleware ran (express would
//     leave it undefined); express.json()/urlencoded() populate it.
//   - Async handlers throw "async handlers unsupported under ch3" at wrap time.

import * as http from 'node:http'
import { createRouter } from '../index.ts'
import { HttpError } from '../index.ts'
import type {
  Ch3App,
  Context,
  ContextValue,
  Handler,
  JsonValue,
  Next,
} from '../index.ts'

export { HttpError }
export type { ContextValue, JsonValue }

// ---------------------------------------------------------------------------
// Public handler types
// ---------------------------------------------------------------------------

// `next()` takes an optional error argument — express semantics: any non-null
// arg (except the string 'route') short-circuits to error middleware.
export type ExpressNext = (err?: unknown) => void
export type ExpressHandler = (
  req: ExpressRequest,
  res: ExpressResponse,
  next: ExpressNext,
) => void
export type ExpressErrorHandler = (
  err: unknown,
  req: ExpressRequest,
  res: ExpressResponse,
  next: ExpressNext,
) => void

// Tag marking an ExpressErrorHandler for the error walk. Required because
// runtime arity introspection (fn.length / fn.toString) is unlowered.
// A plain record, not a class: scriptc cannot store func values on class
// instances (SC9001) — record fields hold fns fine. Discriminated in use()/
// _routeFns via typeof === 'function' since functions aren't records.
export interface ExErrorLayer {
  readonly __exErr: boolean
  readonly fn: ExpressErrorHandler
}

function assertSyncName(name: string): void {
  if (name === 'AsyncFunction') {
    throw new Error('async handlers unsupported under ch3')
  }
}

// Wrap a 4-arity function so it registers as error middleware:
//   app.use(errorHandler((err, req, res, next) => { ... }))
export function errorHandler(fn: ExpressErrorHandler): ExErrorLayer {
  assertSyncName(fn.constructor.name)
  return { __exErr: true, fn: fn }
}

// ---------------------------------------------------------------------------
// Internal tables (all concretely typed)
// ---------------------------------------------------------------------------

interface MwEntry {
  prefix: string | null
  seq: number
  fn: ExpressHandler
}

interface ErrEntry {
  prefix: string | null
  seq: number
  fn: ExpressErrorHandler
}

// One fn slot inside a route registration — exactly one of mw/err is set.
interface RouteFn {
  mw: ExpressHandler | null
  err: ExpressErrorHandler | null
}

// A deferred registration recorded by an ExpressRouter (replayed on mount).
// kind: 0 = mw, 1 = errmw, 2 = route, 3 = nested-router mount.
interface MountItem {
  kind: number
  prefix: string | null
  method: string
  pattern: string
  mw: ExpressHandler | null
  err: ExpressErrorHandler | null
  fns: RouteFn[] | null
  sub: ExpressRouter | null
}

// One executable slot in a dispatch stack — mw or err, tagged with the seq of
// the layer it came from so error scans can continue from the right position.
interface StackSlot {
  seq: number
  mw: ExpressHandler | null
  err: ExpressErrorHandler | null
}

const NO_PARAMS: string[] = []

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function normalizePrefix(p: string): string {
  if (p.length > 1 && p.charAt(p.length - 1) === '/') {
    return p.substring(0, p.length - 1)
  }
  return p
}

function joinPath(prefix: string, path: string): string {
  if (path === '/') {
    return prefix
  }
  if (prefix === '/') {
    return path
  }
  return prefix + path
}

// express mount-mw semantics: '/api' matches '/api' and '/api/*', not '/apix'.
function prefixMatch(path: string, prefix: string | null): boolean {
  if (prefix === null || prefix === '/') {
    return true
  }
  if (path === prefix) {
    return true
  }
  return path.indexOf(prefix + '/') === 0
}

// Ordered param names declared by a pattern (':' prefix, '?' and '{re}'
// stripped; '*' kept). Used to build req.params on route dispatch.
function paramNames(pattern: string): string[] {
  const out: string[] = []
  const parts = pattern.split('/')
  for (let i = 1; i < parts.length; i++) {
    const s = parts[i]
    if (s === '*') {
      out.push('*')
      continue
    }
    if (s.charAt(0) === ':') {
      let n = s.substring(1)
      const b = n.indexOf('{')
      if (b >= 0) {
        n = n.substring(0, b)
      }
      if (n.charAt(n.length - 1) === '?') {
        n = n.substring(0, n.length - 1)
      }
      out.push(n)
    }
  }
  return out
}

function decodeQ(s: string): string {
  try {
    return decodeURIComponent(s.split('+').join(' '))
  } catch (e) {
    return s
  }
}

function parseForm(raw: string): { [k: string]: string } {
  const out: { [k: string]: string } = {}
  if (raw.length === 0) {
    return out
  }
  const pairs = raw.split('&')
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i]
    if (p.length === 0) {
      continue
    }
    const eq = p.indexOf('=')
    let k = p
    let v = ''
    if (eq >= 0) {
      k = p.substring(0, eq)
      v = p.substring(eq + 1)
    }
    out[decodeQ(k)] = decodeQ(v)
  }
  return out
}

function jsonOrNull(raw: string): JsonValue | null {
  try {
    const v: JsonValue = JSON.parse(raw)
    return v
  } catch (e) {
    return null
  }
}

const STATUS_TEXT: { [k: number]: string } = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  301: 'Moved Permanently',
  302: 'Found',
  303: 'See Other',
  304: 'Not Modified',
  307: 'Temporary Redirect',
  308: 'Permanent Redirect',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  410: 'Gone',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  418: "I'm a Teapot",
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
}

function statusText(code: number): string {
  if (Object.prototype.hasOwnProperty.call(STATUS_TEXT, code)) {
    return STATUS_TEXT[code]
  }
  return String(code)
}

const MIME: { [k: string]: string } = {
  html: 'text/html',
  htm: 'text/html',
  txt: 'text/plain',
  text: 'text/plain',
  json: 'application/json',
  css: 'text/css',
  js: 'application/javascript',
  xml: 'application/xml',
  pdf: 'application/pdf',
  bin: 'application/octet-stream',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  csv: 'text/csv',
  form: 'application/x-www-form-urlencoded',
  urlencoded: 'application/x-www-form-urlencoded',
}

function mimeOf(t: string): string {
  let e = t
  if (e.indexOf('/') >= 0) {
    return e
  }
  if (e.charAt(0) === '.') {
    e = e.substring(1)
  }
  e = e.toLowerCase()
  if (Object.prototype.hasOwnProperty.call(MIME, e)) {
    return MIME[e]
  }
  return t
}

// ---------------------------------------------------------------------------
// express req / res facades
// ---------------------------------------------------------------------------

export class ExpressRequest {
  readonly _c: Context
  readonly app: ExpressApp
  readonly method: string
  readonly path: string
  readonly url: string
  readonly originalUrl: string
  readonly params: { [k: string]: string }
  readonly query: { [k: string]: string }
  readonly headers: { [k: string]: string }
  readonly raw: http.IncomingMessage
  readonly res: http.ServerResponse

  constructor(c: Context, app: ExpressApp, names: string[]) {
    this._c = c
    this.app = app
    this.method = c.req.method
    this.path = c.req.path
    this.raw = c.req.raw
    this.url = c.req.raw.url
    this.originalUrl = c.req.raw.url
    this.res = c.res
    const p: { [k: string]: string } = {}
    for (let i = 0; i < names.length; i++) {
      const v = c.req.param(names[i])
      if (v !== null) {
        p[names[i]] = v
      }
    }
    this.params = p
    this.query = c.req.queryAll()
    const hh: { [k: string]: string } = {}
    const raw = c.req.raw.headers
    const keys = Object.keys(raw)
    for (let i = 0; i < keys.length; i++) {
      const v = raw[keys[i]]
      if (typeof v === 'string') {
        hh[keys[i].toLowerCase()] = v
      } else {
        hh[keys[i].toLowerCase()] = String(v)
      }
    }
    this.headers = hh
  }

  // req.get('name') — request header lookup (case-insensitive).
  get(name: string): string | null {
    return this._c.req.header(name)
  }

  header(name: string): string | null {
    return this._c.req.header(name)
  }

  // Parsed body — only set after json()/urlencoded() middleware ran.
  // null otherwise (real express leaves it undefined).
  get body(): JsonValue | null {
    const c = this._c
    if (c.get('ex.body.set') !== true) {
      return null
    }
    const raw = c.get('ex.body.raw')
    if (typeof raw !== 'string') {
      return null
    }
    if (c.get('ex.body.kind') === 'form') {
      const rec = parseForm(raw)
      return rec
    }
    return jsonOrNull(raw)
  }
}

export class ExpressResponse {
  readonly _c: Context
  readonly req: ExpressRequest
  readonly locals: { [k: string]: ContextValue }
  readonly raw: http.ServerResponse

  constructor(c: Context, req: ExpressRequest) {
    this._c = c
    this.req = req
    this.raw = c.res
    const l = c.get('ex.locals')
    if (l !== null && typeof l === 'object') {
      this.locals = l
    } else {
      const rec: { [k: string]: ContextValue } = {}
      c.set('ex.locals', rec)
      this.locals = rec
    }
  }

  get headersSent(): boolean {
    return this._c.sent
  }

  status(n: number): ExpressResponse {
    this._c.status(n)
    return this
  }

  set(k: string, v: string): ExpressResponse {
    this._c.header(k, v)
    return this
  }

  get(k: string): string | null {
    const v = this.raw.getHeader(k.toLowerCase())
    if (typeof v === 'string') {
      return v
    }
    if (typeof v === 'number') {
      return String(v)
    }
    return null
  }

  append(k: string, v: string): ExpressResponse {
    const cur = this.get(k)
    if (cur === null) {
      this._c.header(k, v)
    } else {
      this._c.header(k, cur + ', ' + v)
    }
    return this
  }

  type(t: string): ExpressResponse {
    this._c.type(mimeOf(t))
    return this
  }

  location(url: string): ExpressResponse {
    this._c.header('location', url)
    return this
  }

  vary(k: string): ExpressResponse {
    return this.append('Vary', k)
  }

  links(links: { [k: string]: string }): ExpressResponse {
    const parts: string[] = []
    const keys = Object.keys(links)
    for (let i = 0; i < keys.length; i++) {
      parts.push('<' + links[keys[i]] + '>; rel="' + keys[i] + '"')
    }
    this._c.header('link', parts.join(', '))
    return this
  }

  json(v: JsonValue): ExpressResponse {
    this._c.json(v)
    return this
  }

  // string → text/plain; Buffer → application/octet-stream; other → JSON;
  // null → empty body. (Real express sends strings as text/html — divergence.)
  send(b: JsonValue | Buffer): ExpressResponse {
    const c = this._c
    if (b === null) {
      c.res.end()
      c.sent = true
      return this
    }
    if (Buffer.isBuffer(b)) {
      c.type('application/octet-stream')
      c.body(b)
      return this
    }
    if (typeof b === 'string') {
      c.text(b)
      return this
    }
    c.json(b)
    return this
  }

  sendStatus(code: number): ExpressResponse {
    this._c.status(code)
    this._c.text(statusText(code))
    return this
  }

  // res.redirect(url) or res.redirect(status, url).
  redirect(a: string | number, b: string | null = null): ExpressResponse {
    let url = a
    let code = 302
    if (typeof a === 'number') {
      code = a
      if (b === null) {
        url = '/'
      } else {
        url = b
      }
    }
    this._c.redirect(String(url), code)
    return this
  }

  end(chunk: string | null = null): ExpressResponse {
    if (chunk === null) {
      this.raw.end()
    } else {
      this.raw.end(chunk)
    }
    this._c.sent = true
    return this
  }

  // ---- unsupported surface: loud stubs so a port fails at call time ----

  sendFile(): ExpressResponse {
    throw new Error('res.sendFile unsupported under ch3/express')
  }

  sendfile(): ExpressResponse {
    throw new Error('res.sendfile unsupported under ch3/express')
  }

  download(): ExpressResponse {
    throw new Error('res.download unsupported under ch3/express')
  }

  attachment(): ExpressResponse {
    throw new Error('res.attachment unsupported under ch3/express')
  }

  render(): ExpressResponse {
    throw new Error('res.render unsupported under ch3/express (no view engines)')
  }

  format(): ExpressResponse {
    throw new Error('res.format unsupported under ch3/express')
  }

  cookie(): ExpressResponse {
    throw new Error('res.cookie unsupported under ch3/express')
  }

  clearCookie(): ExpressResponse {
    throw new Error('res.clearCookie unsupported under ch3/express')
  }

  jsonp(v: JsonValue): ExpressResponse {
    throw new Error('res.jsonp unsupported under ch3/express — use res.json')
  }
}

// ---------------------------------------------------------------------------
// Dispatch machinery: express-style linear stack + tagged error middleware
// ---------------------------------------------------------------------------

function express404(c: Context): void {
  if (!c.sent) {
    c.status(404)
    c.text('Cannot ' + c.req.method + ' ' + c.req.path)
  }
}

function finalError(err: unknown, c: Context): void {
  if (c.sent) {
    return
  }
  let st = 500
  let msg = 'Internal Server Error'
  if (err instanceof HttpError) {
    st = err.status
    msg = err.message
  } else {
    msg = statusText(st)
  }
  c.status(st)
  c.text(msg)
}

// Scan the app's tagged error layers (seq > throwSeq, prefix-matched) for the
// first error middleware. Express parity: bare next() and next(err) chain to
// the next error layer; next('route') resumes normal dispatch over the
// remaining matching _mw entries. If the scan exhausts, finalError writes 500.
function outerErr(
  app: ExpressApp,
  err: unknown,
  seq: number,
  c: Context,
  req: ExpressRequest,
  res: ExpressResponse,
  done: () => void,
): void {
  const path = c.req.path
  let cur: unknown = err
  let curSeq = seq
  for (let j = 0; j < app._err.length; j++) {
    const el = app._err[j]
    if (el.seq <= curSeq) {
      continue
    }
    if (!prefixMatch(path, el.prefix)) {
      continue
    }
    const em = el.fn
    let cont = 0 // 0 = no next() call, 1 = next(err)|throw|bare next(), 2 = next('route')
    let nextErr: unknown = null
    const en: ExpressNext = (e2?: unknown) => {
      if (e2 === 'route') {
        cont = 2
        return
      }
      cont = 1
      if (e2 !== null && typeof e2 !== 'undefined') {
        nextErr = e2
        return
      }
      nextErr = cur
    }
    try {
      em(cur, req, res, en)
    } catch (e3) {
      cur = e3
      curSeq = el.seq
      continue
    }
    if (cont === 0) {
      return
    }
    if (cont === 1) {
      cur = nextErr
      curSeq = el.seq
      continue
    }
    // next('route') → resume normal dispatch with _mw entries after this errmw
    runTail(app, c, el.seq, req, res, done)
    return
  }
  finalError(cur, c)
}

// Run the matching _mw entries registered after `seq` (express fallthrough:
// mw after a route run when the handler calls next() / nothing matched).
function runTail(
  app: ExpressApp,
  c: Context,
  seq: number,
  req: ExpressRequest,
  res: ExpressResponse,
  done: () => void,
): void {
  const path = c.req.path
  const slots: StackSlot[] = []
  for (let i = 0; i < app._mw.length; i++) {
    const m = app._mw[i]
    if (m.seq <= seq) {
      continue
    }
    if (!prefixMatch(path, m.prefix)) {
      continue
    }
    slots.push({ seq: m.seq, mw: m.fn, err: null })
  }
  runSlots(app, c, slots, req, res, () => {
    express404(c)
    done()
  })
}

// Core express-style walk over one slot list: normal slots get linear next();
// a throw or next(err) scans forward for error slots; inside an error slot,
// bare next()/next(err)/throw chain to the next error slot and only
// next('route') resumes the normal walk. Slot-list exhaustion → outerErr.
function runSlots(
  app: ExpressApp,
  c: Context,
  slots: StackSlot[],
  req: ExpressRequest,
  res: ExpressResponse,
  done: () => void,
): void {
  let i = 0

  const errNext = (err: unknown, startIdx: number, seq: number): void => {
    for (let j = startIdx; j < slots.length; j++) {
      const em = slots[j].err
      if (em === null) {
        continue
      }
      let cont = 0 // 0 = no next(), 1 = next(err)|throw|bare next(), 2 = next('route')
      let nextErr: unknown = null
      const en: ExpressNext = (e2?: unknown) => {
        if (e2 === 'route') {
          cont = 2
          return
        }
        cont = 1
        if (e2 !== null && typeof e2 !== 'undefined') {
          nextErr = e2
          return
        }
        nextErr = err
      }
      try {
        em(err, req, res, en)
      } catch (e3) {
        errNext(e3, j + 1, slots[j].seq)
        return
      }
      if (cont === 0) {
        return
      }
      if (cont === 1) {
        errNext(nextErr, j + 1, slots[j].seq)
        return
      }
      // next('route') → resume normal dispatch at j+1
      i = j + 1
      next()
      return
    }
    outerErr(app, err, seq, c, req, res, done)
  }

  const next: ExpressNext = (e?: unknown) => {
    if (e !== null && typeof e !== 'undefined') {
      if (e === 'route') {
        done()
        return
      }
      const prev = i - 1
      const seq = prev >= 0 ? slots[prev].seq : 0
      errNext(e, i, seq)
      return
    }
    if (i >= slots.length) {
      done()
      return
    }
    const s = slots[i]
    i = i + 1
    if (s.mw === null) {
      next()
      return
    }
    const h = s.mw
    try {
      h(req, res, next)
    } catch (e2) {
      errNext(e2, i, s.seq)
    }
  }

  next()
}

// One express `use()` middleware as a ch3 Handler.
function makeMwHandler(app: ExpressApp, entry: MwEntry): Handler {
  const h: Handler = (c: Context, next: Next) => {
    const req = new ExpressRequest(c, app, NO_PARAMS)
    const res = new ExpressResponse(c, req)
    const slots: StackSlot[] = [{ seq: entry.seq, mw: entry.fn, err: null }]
    runSlots(app, c, slots, req, res, () => {
      next()
    })
    return c
  }
  return h
}

// One route registration (all its express fns) as a ch3 route Handler.
function makeRouteHandler(
  app: ExpressApp,
  fns: RouteFn[],
  seq: number,
  names: string[],
): Handler {
  const slots: StackSlot[] = []
  for (let i = 0; i < fns.length; i++) {
    slots.push({ seq: seq, mw: fns[i].mw, err: fns[i].err })
  }
  const h: Handler = (c: Context, next: Next) => {
    const req = new ExpressRequest(c, app, names)
    const res = new ExpressResponse(c, req)
    runSlots(app, c, slots, req, res, () => {
      // express fallthrough: remaining middleware after this route, then 404
      runTail(app, c, seq, req, res, () => {
        next()
      })
    })
    return c
  }
  return h
}

// ---------------------------------------------------------------------------
// Shared stack surface (app + router)
// ---------------------------------------------------------------------------

export class ExStack {
  // Emission points — ExpressApp emits live (core + tables), ExpressRouter
  // records MountItems replayed on mount.
  _emitMw(prefix: string | null, fn: ExpressHandler): void {
    throw new Error('abstract _emitMw')
  }

  _emitErr(prefix: string | null, fn: ExpressErrorHandler): void {
    throw new Error('abstract _emitErr')
  }

  _emitRoute(method: string, pattern: string, fns: RouteFn[]): void {
    throw new Error('abstract _emitRoute')
  }

  _emitMount(prefix: string, sub: ExpressRouter): void {
    throw new Error('abstract _emitMount')
  }

  // app.use(fn | 'path', fn | errorLayer | router | router, ...)
  // Routers box as the ExStack base: scriptc can't represent the exact
  // subclass inside this mixed union.
  use(
    ...args: (string | ExpressHandler | ExErrorLayer | ExStack)[]
  ): ExStack {
    let prefix: string | null = null
    for (let i = 0; i < args.length; i++) {
      const a = args[i]
      if (typeof a === 'string') {
        prefix = normalizePrefix(a)
        continue
      }
      if (a instanceof ExStack) {
        if (a instanceof ExpressRouter) {
          if (prefix === null) {
            this._emitMount('/', a)
          } else {
            this._emitMount(prefix, a)
          }
          continue
        }
        throw new Error('app.use: unsupported stack object')
      }
      if (typeof a === 'function') {
        this._emitMw(prefix, a)
        continue
      }
      this._emitErr(prefix, a.fn)
    }
    return this
  }

  private _routeFns(
    method: string,
    path: string,
    fns: (ExpressHandler | ExErrorLayer)[],
  ): ExStack {
    const slots: RouteFn[] = []
    for (let i = 0; i < fns.length; i++) {
      const f = fns[i]
      if (typeof f === 'function') {
        assertSyncName(f.constructor.name)
        slots.push({ mw: f, err: null })
      } else {
        assertSyncName(f.fn.constructor.name)
        slots.push({ mw: null, err: f.fn })
      }
    }
    if (slots.length === 0) {
      throw new Error('app.' + method.toLowerCase() + ': at least one handler required')
    }
    this._emitRoute(method, path, slots)
    return this
  }

  _route(
    method: string,
    path: string,
    fns: (ExpressHandler | ExErrorLayer)[],
  ): ExStack {
    return this._routeFns(method, path, fns)
  }

  get(path: string, ...fns: (ExpressHandler | ExErrorLayer)[]): ExStack {
    return this._routeFns('GET', path, fns)
  }

  post(path: string, ...fns: (ExpressHandler | ExErrorLayer)[]): ExStack {
    return this._routeFns('POST', path, fns)
  }

  put(path: string, ...fns: (ExpressHandler | ExErrorLayer)[]): ExStack {
    return this._routeFns('PUT', path, fns)
  }

  delete(path: string, ...fns: (ExpressHandler | ExErrorLayer)[]): ExStack {
    return this._routeFns('DELETE', path, fns)
  }

  patch(path: string, ...fns: (ExpressHandler | ExErrorLayer)[]): ExStack {
    return this._routeFns('PATCH', path, fns)
  }

  options(path: string, ...fns: (ExpressHandler | ExErrorLayer)[]): ExStack {
    return this._routeFns('OPTIONS', path, fns)
  }

  head(path: string, ...fns: (ExpressHandler | ExErrorLayer)[]): ExStack {
    return this._routeFns('HEAD', path, fns)
  }

  all(path: string, ...fns: (ExpressHandler | ExErrorLayer)[]): ExStack {
    for (let i = 0; i < ALL_METHODS.length; i++) {
      this._routeFns(ALL_METHODS[i], path, fns)
    }
    return this
  }

  // app.route('/x').get(fn).post(fn) — Route object parity.
  route(path: string): ExRouteBuilder {
    return new ExRouteBuilder(this, path)
  }

  // Mount an ExpressRouter under a prefix — the scriptc-safe spelling of
  // app.use('/api', router) (a class value can't box into use()'s mixed
  // union under scriptc; both forms work under plain node/tsc).
  mount(prefix: string, sub: ExpressRouter): ExStack {
    this._emitMount(prefix, sub)
    return this
  }
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

// express's app.route(path) builder: chained method calls on one path.
export class ExRouteBuilder {
  private _host: ExStack
  private _path: string

  constructor(host: ExStack, path: string) {
    this._host = host
    this._path = path
  }

  get(...fns: (ExpressHandler | ExErrorLayer)[]): ExRouteBuilder {
    this._host._route('GET', this._path, fns)
    return this
  }

  post(...fns: (ExpressHandler | ExErrorLayer)[]): ExRouteBuilder {
    this._host._route('POST', this._path, fns)
    return this
  }

  put(...fns: (ExpressHandler | ExErrorLayer)[]): ExRouteBuilder {
    this._host._route('PUT', this._path, fns)
    return this
  }

  delete(...fns: (ExpressHandler | ExErrorLayer)[]): ExRouteBuilder {
    this._host._route('DELETE', this._path, fns)
    return this
  }

  patch(...fns: (ExpressHandler | ExErrorLayer)[]): ExRouteBuilder {
    this._host._route('PATCH', this._path, fns)
    return this
  }

  all(...fns: (ExpressHandler | ExErrorLayer)[]): ExRouteBuilder {
    for (let i = 0; i < ALL_METHODS.length; i++) {
      this._host._route(ALL_METHODS[i], this._path, fns)
    }
    return this
  }
}

// ---------------------------------------------------------------------------
// ExpressApp — express()
// ---------------------------------------------------------------------------

export class ExpressApp extends ExStack {
  readonly _router: Ch3App
  readonly _mw: MwEntry[]
  readonly _err: ErrEntry[]
  readonly _settings: { [k: string]: ContextValue }
  readonly locals: { [k: string]: ContextValue }
  private _seq: number

  constructor() {
    super()
    this._router = createRouter({ env: {} })
    this._mw = []
    this._err = []
    this._settings = {}
    this.locals = {}
    this._seq = 0

    const app = this
    // express default: X-Powered-By: Express (disable via app.disable).
    this._emitMw(null, (req: ExpressRequest, res: ExpressResponse, next: ExpressNext) => {
      if (app._settings['x-powered-by'] !== false) {
        res.set('x-powered-by', 'Express')
      }
      next()
    })

    // Unmatched path: express runs the whole middleware stack then the
    // finalhandler 404 — runTail(seq=-1) replays every matching mw.
    this._router.notFound((c: Context) => {
      const req = new ExpressRequest(c, app, NO_PARAMS)
      const res = new ExpressResponse(c, req)
      runTail(app, c, -1, req, res, () => {})
      return c
    })

    this._router.onError((err: HttpError | Error, c: Context) => {
      finalError(err, c)
      return c
    })
  }

  private _nextSeq(): number {
    this._seq = this._seq + 1
    return this._seq
  }

  _emitMw(prefix: string | null, fn: ExpressHandler): void {
    assertSyncName(fn.constructor.name)
    const seq = this._nextSeq()
    const e: MwEntry = { prefix: prefix, seq: seq, fn: fn }
    this._mw.push(e)
    const h = makeMwHandler(this, e)
    if (prefix === null) {
      this._router.use(h)
    } else {
      this._router.use(prefix, h)
    }
  }

  _emitErr(prefix: string | null, fn: ExpressErrorHandler): void {
    this._err.push({ prefix: prefix, seq: this._nextSeq(), fn: fn })
  }

  _emitRoute(method: string, pattern: string, fns: RouteFn[]): void {
    const seq = this._nextSeq()
    const names = paramNames(pattern)
    const h = makeRouteHandler(this, fns, seq, names)
    if (method === 'GET') {
      this._router.get(pattern, h)
    } else if (method === 'POST') {
      this._router.post(pattern, h)
    } else if (method === 'PUT') {
      this._router.put(pattern, h)
    } else if (method === 'DELETE') {
      this._router.delete(pattern, h)
    } else if (method === 'PATCH') {
      this._router.patch(pattern, h)
    } else if (method === 'OPTIONS') {
      this._router.options(pattern, h)
    } else if (method === 'HEAD') {
      this._router.head(pattern, h)
    } else {
      throw new Error('method not supported under ch3: ' + method)
    }
  }

  _emitMount(prefix: string, sub: ExpressRouter): void {
    const p = normalizePrefix(prefix)
    sub._replay(p, this)
  }

  // ---- express settings surface ----

  set(name: string, value: ContextValue): ExpressApp {
    this._settings[name] = value
    return this
  }

  setting(name: string): ContextValue | null {
    if (Object.prototype.hasOwnProperty.call(this._settings, name)) {
      return this._settings[name]
    }
    return null
  }

  enable(name: string): ExpressApp {
    this._settings[name] = true
    return this
  }

  disable(name: string): ExpressApp {
    this._settings[name] = false
    return this
  }

  enabled(name: string): boolean {
    return this._settings[name] === true
  }

  disabled(name: string): boolean {
    return this._settings[name] === false
  }

  // app.listen(port[, cb]) → ch3 serve sugar.
  listen(port: number, cb: (() => void) | null = null): http.Server {
    const srv = this._router.serve({
      port: port,
      hostname: null,
      maxBodyBytes: null,
    })
    if (cb !== null) {
      srv.on('listening', cb)
    }
    return srv
  }

  // Escape hatches.
  handler(): (req: http.IncomingMessage, res: http.ServerResponse) => void {
    return this._router.handler()
  }

  request(
    path: string,
    opts: { method: string | null; body: string | null; headers: { [k: string]: string } | null } | null = null,
  ): Promise<unknown> {
    return this._router.request(path, opts)
  }
}

// ---------------------------------------------------------------------------
// ExpressRouter — express.Router()
// ---------------------------------------------------------------------------

export class ExpressRouter extends ExStack {
  readonly _items: MountItem[]

  constructor() {
    super()
    this._items = []
  }

  _emitMw(prefix: string | null, fn: ExpressHandler): void {
    assertSyncName(fn.constructor.name)
    this._items.push({
      kind: 0,
      prefix: prefix,
      method: '',
      pattern: '',
      mw: fn,
      err: null,
      fns: null,
      sub: null,
    })
  }

  _emitErr(prefix: string | null, fn: ExpressErrorHandler): void {
    this._items.push({
      kind: 1,
      prefix: prefix,
      method: '',
      pattern: '',
      mw: null,
      err: fn,
      fns: null,
      sub: null,
    })
  }

  _emitRoute(method: string, pattern: string, fns: RouteFn[]): void {
    this._items.push({
      kind: 2,
      prefix: null,
      method: method,
      pattern: pattern,
      mw: null,
      err: null,
      fns: fns,
      sub: null,
    })
  }

  _emitMount(prefix: string, sub: ExpressRouter): void {
    this._items.push({
      kind: 3,
      prefix: normalizePrefix(prefix),
      method: '',
      pattern: '',
      mw: null,
      err: null,
      fns: null,
      sub: sub,
    })
  }

  // Replay this router's items onto `target` under `prefix` — registration
  // order preserved, mw/err prefixes and route patterns joined.
  _replay(prefix: string, target: ExStack): void {
    for (let i = 0; i < this._items.length; i++) {
      const it = this._items[i]
      if (it.kind === 0 && it.mw !== null) {
        let p: string | null = prefix
        if (it.prefix !== null) {
          p = joinPath(prefix, it.prefix)
        }
        target._emitMw(p, it.mw)
        continue
      }
      if (it.kind === 1 && it.err !== null) {
        let p: string | null = prefix
        if (it.prefix !== null) {
          p = joinPath(prefix, it.prefix)
        }
        target._emitErr(p, it.err)
        continue
      }
      if (it.kind === 2 && it.fns !== null) {
        target._emitRoute(it.method, joinPath(prefix, it.pattern), it.fns)
        continue
      }
      if (it.kind === 3 && it.sub !== null && it.prefix !== null) {
        target._emitMount(joinPath(prefix, it.prefix), it.sub)
        continue
      }
    }
  }
}

// ---------------------------------------------------------------------------
// express() factory + body-parser middleware + named Router export
// ---------------------------------------------------------------------------

export function express(): ExpressApp {
  return new ExpressApp()
}

export function Router(): ExpressRouter {
  return new ExpressRouter()
}

// express.json() — parse JSON request bodies onto req.body. req.body is {}
// when no JSON body is present (body-parser parity), null when this
// middleware never ran.
export function json(): ExpressHandler {
  const mw: ExpressHandler = (
    req: ExpressRequest,
    res: ExpressResponse,
    next: ExpressNext,
  ) => {
    const c = req._c
    const ct = c.req.header('content-type')
    let raw = '{}'
    if (ct !== null && ct.indexOf('json') >= 0) {
      const b = c.req.body()
      if (b.length > 0) {
        try {
          JSON.parse(b)
        } catch (e) {
          next(new HttpError(400, 'invalid JSON body', null))
          return
        }
        raw = b
      }
    }
    c.set('ex.body.set', true)
    c.set('ex.body.kind', 'json')
    c.set('ex.body.raw', raw)
    next()
  }
  return mw
}

// express.urlencoded() — parse application/x-www-form-urlencoded bodies.
export function urlencoded(): ExpressHandler {
  const mw: ExpressHandler = (
    req: ExpressRequest,
    res: ExpressResponse,
    next: ExpressNext,
  ) => {
    const c = req._c
    const ct = c.req.header('content-type')
    let raw = ''
    if (ct !== null && ct.indexOf('x-www-form-urlencoded') >= 0) {
      raw = c.req.body()
    }
    c.set('ex.body.set', true)
    c.set('ex.body.kind', 'form')
    c.set('ex.body.raw', raw)
    next()
  }
  return mw
}

export default express
