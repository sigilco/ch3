// test/stub-fmw.ts — minimal in-memory stub of the frozen ch3 contract
// (DESIGN.md §7) so the fmw shim's unit tests run before the real core lands.
// See MERGE-NOTE-fmw.md for exactly what this fakes.
//
// Subset-clean on purpose: the scriptc smoke build pulls this file in through
// the shim's core binding, so it must compile too.

import * as http from 'node:http'

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }
export type ContextValue = JsonValue
export type Next = () => void
export type Handler = (c: Context, next: Next) => void | Context

export interface RouteConstraints {
  regex: RegExp | null
  host: string | null
  version: string | null
}

export interface RouteEntry {
  method: string
  pattern: string
  paramNames: string[]
  regexParam: string | null
  handler: Handler
  middleware: Handler[]
  constraints: RouteConstraints | null
}

export interface MatchResult {
  handler: Handler
  middleware: Handler[]
  params: { [k: string]: string }
  entry: RouteEntry
}

export interface Ch3Core {
  add(method: string, path: string, handler: Handler, middleware: Handler[], constraints: RouteConstraints | null): void
  find(method: string, path: string): MatchResult | null
  allowedMethods(path: string): string[]
  dispatch(c: Context, match: MatchResult | null): void
  all(): RouteEntry[]
  mount(prefix: string, sub: Ch3Core): void
}

export class HttpError extends Error {
  status: number
  extras: { [k: string]: JsonValue } | null
  constructor(status: number, message: string, extras: { [k: string]: JsonValue } | null) {
    super(message)
    this.status = status
    this.extras = extras
  }
}

export class Ch3Request {
  method: string
  path: string
  raw: http.IncomingMessage
  _params: { [k: string]: string }
  _query: { [k: string]: string[] }
  _headers: { [k: string]: string }
  _body: string

  constructor(
    method: string,
    path: string,
    params: { [k: string]: string },
    query: { [k: string]: string[] },
    headers: { [k: string]: string },
    body: string,
    raw: http.IncomingMessage,
  ) {
    this.method = method
    this.path = path
    this._params = params
    this._query = query
    this._headers = headers
    this._body = body
    this.raw = raw
  }

  param(name: string): string | null {
    if (Object.keys(this._params).indexOf(name) < 0) return null
    return this._params[name]
  }

  query(name: string): string | null {
    if (Object.keys(this._query).indexOf(name) < 0) return null
    const vs = this._query[name]
    if (vs.length === 0) return null
    return vs[vs.length - 1]
  }

  queries(name: string): string[] {
    if (Object.keys(this._query).indexOf(name) < 0) return []
    return this._query[name]
  }

  queryAll(): { [k: string]: string } {
    const out: { [k: string]: string } = {}
    const keys = Object.keys(this._query)
    for (let i = 0; i < keys.length; i++) {
      const vs = this._query[keys[i]]
      out[keys[i]] = vs[vs.length - 1]
    }
    return out
  }

  header(name: string): string | null {
    const key = name.toLowerCase()
    if (Object.keys(this._headers).indexOf(key) < 0) return null
    return this._headers[key]
  }

  body(): string {
    return this._body
  }

  bodyJson(): JsonValue {
    try {
      return JSON.parse(this._body) as JsonValue
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new HttpError(400, 'invalid JSON body: ' + msg, null)
    }
  }
}

export class Context {
  req: Ch3Request
  res: http.ServerResponse
  env: { [k: string]: ContextValue }
  vars: { [k: string]: ContextValue }
  sent: boolean

  constructor(req: Ch3Request, res: http.ServerResponse, env: { [k: string]: ContextValue }) {
    this.req = req
    this.res = res
    this.env = env
    this.vars = {}
    this.sent = false
  }

  status(n: number): Context {
    this.res.statusCode = n
    return this
  }

  header(k: string, v: string): Context {
    this.res.setHeader(k, v)
    return this
  }

  type(t: string): Context {
    this.res.setHeader('content-type', t)
    return this
  }

  json(obj: JsonValue): Context {
    this.res.setHeader('content-type', 'application/json')
    this.res.end(JSON.stringify(obj))
    this.sent = true
    return this
  }

  text(s: string): Context {
    this.res.setHeader('content-type', 'text/plain')
    this.res.end(s)
    this.sent = true
    return this
  }

  html(s: string): Context {
    this.res.setHeader('content-type', 'text/html')
    this.res.end(s)
    this.sent = true
    return this
  }

  body(b: Buffer | string): Context {
    if (typeof b === 'string') {
      this.res.end(b)
    } else {
      this.res.end(b)
    }
    this.sent = true
    return this
  }

  redirect(url: string, code: number): Context {
    this.res.statusCode = code
    this.res.setHeader('location', url)
    this.res.end()
    this.sent = true
    return this
  }

  set(k: string, v: ContextValue): void {
    this.vars[k] = v
  }

  get(k: string): ContextValue | null {
    if (Object.keys(this.vars).indexOf(k) < 0) return null
    return this.vars[k]
  }
}

// ---- stub core ----

const SEG_STATIC = 0
const SEG_PARAM = 1
const SEG_WILD = 2

interface StubSeg {
  kind: number
  name: string
}

interface StubRoute {
  segs: StubSeg[]
  entry: RouteEntry
  order: number
}

function splitSegs(path: string): string[] {
  const out: string[] = []
  const parts = path.split('/')
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] !== '') out.push(parts[i])
  }
  return out
}

function parseSeg(seg: string, names: string[], regexParam: string[]): StubSeg {
  if (seg === '*') return { kind: SEG_WILD, name: '*' }
  if (seg.charCodeAt(0) === 58) {
    // ':' prefix — name up to '{' (regex) or end; '?' already expanded away
    const b = seg.indexOf('{')
    if (b < 0) {
      const n = seg.slice(1)
      names.push(n)
      return { kind: SEG_PARAM, name: n }
    }
    const n = seg.slice(1, b)
    names.push(n)
    regexParam.push(n)
    return { kind: SEG_PARAM, name: n }
  }
  return { kind: SEG_STATIC, name: seg }
}

function expandOptional(path: string): string[] {
  // Expand `:x?` segments into with/without variants. Cap: 3 optionals.
  const segs = splitSegs(path)
  let optCount = 0
  for (let i = 0; i < segs.length; i++) {
    if (segs[i].endsWith('?')) optCount += 1
  }
  if (optCount > 3) throw new HttpError(500, 'more than 3 optional segments in pattern: ' + path, null)
  const total = 1 << optCount
  const variants: string[] = []
  for (let mask = 0; mask < total; mask++) {
    let v = ''
    let seen = 0
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i]
      if (s.endsWith('?')) {
        const keep = (mask & (1 << seen)) !== 0
        seen += 1
        if (keep) v = v + '/' + s.slice(0, s.length - 1)
      } else {
        v = v + '/' + s
      }
    }
    if (v === '') v = '/'
    variants.push(v)
  }
  return variants
}

class StubCore implements Ch3Core {
  routes: { [k: string]: StubRoute[] }
  entries: RouteEntry[]
  counter: number
  globalMw: { prefix: string | null; fn: Handler }[]
  notFoundFn: (c: Context) => void | Context
  onErrorFn: (err: HttpError | Error, c: Context) => void | Context

  constructor() {
    this.routes = {}
    this.entries = []
    this.counter = 0
    this.globalMw = []
    this.notFoundFn = (c: Context) => {
      c.status(404)
      c.res.end()
      c.sent = true
      return c
    }
    this.onErrorFn = (err: HttpError | Error, c: Context) => {
      const status = err instanceof HttpError ? err.status : 500
      c.status(status)
      c.res.end()
      c.sent = true
      return c
    }
  }

  add(method: string, path: string, handler: Handler, middleware: Handler[], constraints: RouteConstraints | null): void {
    let norm = path
    if (norm.length > 1 && norm.endsWith('/')) norm = norm.slice(0, norm.length - 1)
    const variants = expandOptional(norm)
    for (let v = 0; v < variants.length; v++) {
      const variant = variants[v]
      const names: string[] = []
      const regexParam: string[] = []
      const rawSegs = splitSegs(variant)
      const segs: StubSeg[] = []
      for (let i = 0; i < rawSegs.length; i++) {
        const s = parseSeg(rawSegs[i], names, regexParam)
        if (s.kind === SEG_WILD && i !== rawSegs.length - 1) {
          throw new HttpError(500, 'wildcard must be the last segment: ' + path, null)
        }
        segs.push(s)
      }
      let cons = constraints
      if (regexParam.length > 0) {
        // rebuild regex from the {re} suffix of the marked segment
        let re: RegExp | null = cons === null ? null : cons.regex
        for (let i = 0; i < rawSegs.length; i++) {
          const s = rawSegs[i]
          const b = s.indexOf('{')
          if (s.charCodeAt(0) === 58 && b > 0 && s.endsWith('}')) {
            const n = s.slice(1, b)
            if (n === regexParam[0]) re = new RegExp('^(?:' + s.slice(b + 1, s.length - 1) + ')$')
          }
        }
        cons = { regex: re, host: cons === null ? null : cons.host, version: cons === null ? null : cons.version }
      }
      const entry: RouteEntry = {
        method: method,
        pattern: variant,
        paramNames: names,
        regexParam: regexParam.length > 0 ? regexParam[0] : null,
        handler: handler,
        middleware: middleware,
        constraints: cons,
      }
      const route: StubRoute = { segs: segs, entry: entry, order: this.counter }
      this.counter += 1
      if (Object.keys(this.routes).indexOf(method) < 0) {
        this.routes[method] = [route]
      } else {
        this.routes[method].push(route)
      }
      this.entries.push(entry)
    }
  }

  _matchSegs(segs: StubSeg[], pathSegs: string[], entry: RouteEntry): { [k: string]: string } | null {
    const params: { [k: string]: string } = {}
    let pi = 0
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i]
      if (s.kind === SEG_WILD) {
        params['*'] = pathSegs.slice(pi).join('/')
        return params
      }
      if (pi >= pathSegs.length) return null
      const value = pathSegs[pi]
      if (s.kind === SEG_STATIC) {
        if (s.name !== value) return null
      } else {
        if (value === '') return null
        if (entry.regexParam !== null && s.name === entry.regexParam && entry.constraints !== null && entry.constraints.regex !== null) {
          const m = entry.constraints.regex.exec(value)
          if (m === null) return null
        }
        params[s.name] = value
      }
      pi += 1
    }
    if (pi !== pathSegs.length) return null
    return params
  }

  _scoreRoute(segs: StubSeg[]): number[] {
    const score: number[] = []
    for (let i = 0; i < segs.length; i++) {
      const k = segs[i].kind
      score.push(k === SEG_STATIC ? 2 : k === SEG_PARAM ? 1 : 0)
    }
    return score
  }

  _better(score: number[], best: number[] | null): boolean {
    if (best === null) return true
    for (let i = 0; i < score.length && i < best.length; i++) {
      if (score[i] !== best[i]) return score[i] > best[i]
    }
    return false
  }

  find(method: string, path: string): MatchResult | null {
    let norm = path
    if (norm.length > 1 && norm.endsWith('/')) norm = norm.slice(0, norm.length - 1)
    const pathSegs = splitSegs(norm)
    if (Object.keys(this.routes).indexOf(method) < 0) return null
    const list = this.routes[method]
    let bestScore: number[] | null = null
    let bestRoute: StubRoute | null = null
    let bestParams: { [k: string]: string } | null = null
    for (let i = 0; i < list.length; i++) {
      const r = list[i]
      const params = this._matchSegs(r.segs, pathSegs, r.entry)
      if (params === null) continue
      const score = this._scoreRoute(r.segs)
      if (this._better(score, bestScore)) {
        bestScore = score
        bestRoute = r
        bestParams = params
      }
    }
    if (bestRoute === null || bestParams === null) return null
    const mw: Handler[] = []
    for (let i = 0; i < this.globalMw.length; i++) {
      const g = this.globalMw[i]
      if (g.prefix === null || norm.startsWith(g.prefix)) mw.push(g.fn)
    }
    const emw = bestRoute.entry.middleware
    for (let i = 0; i < emw.length; i++) mw.push(emw[i])
    return { handler: bestRoute.entry.handler, middleware: mw, params: bestParams, entry: bestRoute.entry }
  }

  allowedMethods(path: string): string[] {
    let norm = path
    if (norm.length > 1 && norm.endsWith('/')) norm = norm.slice(0, norm.length - 1)
    const pathSegs = splitSegs(norm)
    const out: string[] = []
    const methods = Object.keys(this.routes)
    for (let i = 0; i < methods.length; i++) {
      const list = this.routes[methods[i]]
      let hit = false
      for (let j = 0; j < list.length; j++) {
        if (this._matchSegs(list[j].segs, pathSegs, list[j].entry) !== null) {
          hit = true
          break
        }
      }
      if (hit) out.push(methods[i])
    }
    return out
  }

  all(): RouteEntry[] {
    return this.entries
  }

  mount(prefix: string, sub: Ch3Core): void {
    const entries = sub.all()
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      let p = prefix
      if (p.endsWith('/')) p = p.slice(0, p.length - 1)
      const joined = e.pattern === '/' ? p : p + e.pattern
      this.add(e.method, joined, e.handler, e.middleware, e.constraints)
    }
  }

  dispatch(c: Context, match: MatchResult | null): void {
    if (match === null) {
      this.notFoundFn(c)
      return
    }
    const mw = match.middleware
    let i = 0
    let ranHandler = false
    const step: Next = () => {
      i += 1
      run()
    }
    const run = () => {
      if (i < mw.length) {
        mw[i](c, step)
        return
      }
      if (!ranHandler) {
        ranHandler = true
        match.handler(c, step)
      }
    }
    try {
      run()
    } catch (e) {
      const err = e instanceof HttpError ? e : e instanceof Error ? e : new Error(String(e))
      this.onErrorFn(err, c)
    }
  }
}

export function createCore(): Ch3Core {
  return new StubCore()
}

// ---- minimal Ch3App on the stub core ----

export interface Ch3App {
  get(path: string, ...fns: Handler[]): Ch3App
  post(path: string, ...fns: Handler[]): Ch3App
  put(path: string, ...fns: Handler[]): Ch3App
  delete(path: string, ...fns: Handler[]): Ch3App
  patch(path: string, ...fns: Handler[]): Ch3App
  options(path: string, ...fns: Handler[]): Ch3App
  head(path: string, ...fns: Handler[]): Ch3App
  all(path: string, ...fns: Handler[]): Ch3App
  use(...args: (string | Handler)[]): Ch3App
  route(prefix: string, sub: Ch3App): Ch3App
  notFound(h: (c: Context) => void | Context): Ch3App
  onError(h: (err: HttpError | Error, c: Context) => void | Context): Ch3App
  handler(): (req: http.IncomingMessage, res: http.ServerResponse) => void
  serve(opts: { port: number; hostname?: string | null; maxBodyBytes?: number | null }): http.Server
  request(path: string, opts?: { method?: string | null; body?: string | null; headers?: { [k: string]: string } | null } | null): Promise<unknown>
}

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']

class StubRouter implements Ch3App {
  core: StubCore
  env: { [k: string]: ContextValue }
  maxBody: number

  constructor(env: { [k: string]: ContextValue }) {
    this.core = new StubCore()
    this.env = env
    this.maxBody = 1 << 20
  }

  _on(method: string, path: string, fns: Handler[]): Ch3App {
    if (fns.length === 0) return this
    const mw: Handler[] = []
    for (let i = 0; i < fns.length - 1; i++) mw.push(fns[i])
    this.core.add(method, path, fns[fns.length - 1], mw, null)
    return this
  }

  get(path: string, ...fns: Handler[]): Ch3App {
    return this._on('GET', path, fns)
  }
  post(path: string, ...fns: Handler[]): Ch3App {
    return this._on('POST', path, fns)
  }
  put(path: string, ...fns: Handler[]): Ch3App {
    return this._on('PUT', path, fns)
  }
  delete(path: string, ...fns: Handler[]): Ch3App {
    return this._on('DELETE', path, fns)
  }
  patch(path: string, ...fns: Handler[]): Ch3App {
    return this._on('PATCH', path, fns)
  }
  options(path: string, ...fns: Handler[]): Ch3App {
    return this._on('OPTIONS', path, fns)
  }
  head(path: string, ...fns: Handler[]): Ch3App {
    return this._on('HEAD', path, fns)
  }
  all(path: string, ...fns: Handler[]): Ch3App {
    for (let i = 0; i < METHODS.length; i++) this._on(METHODS[i], path, fns)
    return this
  }

  use(...args: (string | Handler)[]): Ch3App {
    for (let i = 0; i < args.length; i++) {
      const a = args[i]
      if (typeof a === 'string') {
        const fn = args[i + 1]
        if (typeof fn === 'function') {
          this.core.globalMw.push({ prefix: a, fn: fn })
          i += 1
        }
      } else if (typeof a === 'function') {
        this.core.globalMw.push({ prefix: null, fn: a })
      }
    }
    return this
  }

  route(prefix: string, sub: Ch3App): Ch3App {
    this.core.mount(prefix, this.coreOf(sub))
    return this
  }

  coreOf(sub: Ch3App): Ch3Core {
    if (sub instanceof StubRouter) return sub.core
    return this.core
  }

  notFound(h: (c: Context) => void | Context): Ch3App {
    this.core.notFoundFn = h
    return this
  }

  onError(h: (err: HttpError | Error, c: Context) => void | Context): Ch3App {
    this.core.onErrorFn = h
    return this
  }

  _buildQuery(rawQuery: string): { [k: string]: string[] } {
    const q: { [k: string]: string[] } = {}
    if (rawQuery === '') return q
    const pairs = rawQuery.split('&')
    for (let i = 0; i < pairs.length; i++) {
      const p = pairs[i]
      if (p === '') continue
      const e = p.indexOf('=')
      const key = e < 0 ? p : p.slice(0, e)
      const val = e < 0 ? '' : p.slice(e + 1)
      if (Object.keys(q).indexOf(key) < 0) {
        q[key] = [val]
      } else {
        q[key].push(val)
      }
    }
    return q
  }

  _buildHeaders(req: http.IncomingMessage): { [k: string]: string } {
    const h: { [k: string]: string } = {}
    const keys = Object.keys(req.headers)
    for (let i = 0; i < keys.length; i++) {
      const v = req.headers[keys[i]]
      if (typeof v === 'string') {
        h[keys[i]] = v
      } else if (v !== undefined) {
        h[keys[i]] = String(v)
      }
    }
    return h
  }

  handler(): (req: http.IncomingMessage, res: http.ServerResponse) => void {
    const app = this
    return (req: http.IncomingMessage, res: http.ServerResponse) => {
      const chunks: string[] = []
      let tooBig = false
      req.on('data', (c: Buffer) => {
        chunks.push(c.toString())
        let total = 0
        for (let i = 0; i < chunks.length; i++) total += chunks[i].length
        if (total > app.maxBody) tooBig = true
      })
      req.on('end', () => {
        if (tooBig) {
          res.statusCode = 413
          res.end()
          req.destroy()
          return
        }
        const rawUrl = req.url === undefined ? '/' : req.url
        const q = rawUrl.indexOf('?')
        const path = q < 0 ? rawUrl : rawUrl.slice(0, q)
        const query = q < 0 ? '' : rawUrl.slice(q + 1)
        const method = req.method === undefined ? 'GET' : req.method
        const match = app.core.find(method, path)
        const params: { [k: string]: string } = match === null ? {} : match.params
        const ch3req = new Ch3Request(method, path, params, app._buildQuery(query), app._buildHeaders(req), chunks.join(''), req)
        const ctx = new Context(ch3req, res, app.env)
        if (match === null) {
          const allowed = app.core.allowedMethods(path)
          if (allowed.length > 0) {
            res.statusCode = 405
            res.setHeader('allow', allowed.join(', '))
            res.end()
            return
          }
        }
        app.core.dispatch(ctx, match)
      })
    }
  }

  serve(opts: { port: number; hostname?: string | null; maxBodyBytes?: number | null }): http.Server {
    if ('maxBodyBytes' in opts && opts.maxBodyBytes !== null && opts.maxBodyBytes !== undefined) this.maxBody = opts.maxBodyBytes
    const srv = http.createServer(this.handler())
    const host = 'hostname' in opts ? opts.hostname : null
    if (host === undefined || host === null) {
      srv.listen(opts.port)
    } else {
      srv.listen(opts.port, host)
    }
    return srv
  }

  request(path: string, opts?: { method?: string | null; body?: string | null; headers?: { [k: string]: string } | null } | null): Promise<unknown> {
    const srv = this.serve({ port: 0 })
    const a = srv.address() as { port: number } | null
    const port = a === null ? 0 : a.port
    const hasOpts = opts !== null && opts !== undefined
    const method = hasOpts && 'method' in opts && opts.method !== null && opts.method !== undefined ? opts.method : 'GET'
    const body = hasOpts && 'body' in opts && opts.body !== null && opts.body !== undefined ? opts.body : null
    const headers = hasOpts && 'headers' in opts && opts.headers !== null && opts.headers !== undefined ? opts.headers : null
    const init = { method: method, body: body === null ? null : body, headers: headers === null ? undefined : headers }
    return fetch('http://127.0.0.1:' + String(port) + path, init).then((r: unknown) => {
      srv.close()
      return r
    })
  }
}

export function createRouter(opts?: { env?: { [k: string]: ContextValue } | null; maxCacheEntries?: number | null } | null): Ch3App {
  const env: { [k: string]: ContextValue } = {}
  if (opts !== null && opts !== undefined && 'env' in opts && opts.env !== null && opts.env !== undefined) {
    const keys = Object.keys(opts.env)
    for (let i = 0; i < keys.length; i++) {
      const v = opts.env[keys[i]]
      if (v !== undefined) env[keys[i]] = v
    }
  }
  return new StubRouter(env)
}
