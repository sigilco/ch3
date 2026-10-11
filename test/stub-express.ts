// test/stub-express.ts — TEST-ONLY stand-in for src/index.ts.
//
// Implements the frozen Ch3App/Context/Ch3Request/HttpError contract from
// DESIGN.md §2/§7 as a minimal in-memory router, good enough to run the
// ch3/express shim's unit tests under `node --test` and the scriptc smoke build.
// The real core (branch devin/core-v0) replaces this file at
// src/index.ts — test/run-express.sh copies this stub there ONLY when
// src/index.ts is absent. See MERGE-NOTE-express.md for exactly what it fakes.
// Subset-authored like the real core: | null unions, plain records, indexed
// loops, no shorthand forms, res.end as statement, buffered body via
// req.on('data').

import * as http from 'node:http'

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [k: string]: JsonValue }
export type ContextValue =
  | string
  | number
  | boolean
  | null
  | { [k: string]: ContextValue }
export type Next = () => void
export type Handler = (c: Context, next: Next) => void | Context

export class HttpError extends Error {
  status: number
  extras: { [k: string]: ContextValue } | null

  constructor(
    status: number,
    message: string,
    extras: { [k: string]: ContextValue } | null = null,
  ) {
    super(message)
    this.status = status
    this.extras = extras
  }
}

export class Ch3Request {
  readonly method: string
  readonly path: string
  readonly raw: http.IncomingMessage
  private _params: { [k: string]: string }
  private _qAll: { [k: string]: string }
  private _queries: { [k: string]: string[] }
  private _headers: { [k: string]: string }
  private _body: string

  constructor(
    method: string,
    path: string,
    raw: http.IncomingMessage,
    params: { [k: string]: string },
    qAll: { [k: string]: string },
    queries: { [k: string]: string[] },
    headers: { [k: string]: string },
    body: string,
  ) {
    this.method = method
    this.path = path
    this.raw = raw
    this._params = params
    this._qAll = qAll
    this._queries = queries
    this._headers = headers
    this._body = body
  }

  param(name: string): string | null {
    if (Object.prototype.hasOwnProperty.call(this._params, name)) {
      return this._params[name]
    }
    return null
  }

  query(name: string): string | null {
    if (Object.prototype.hasOwnProperty.call(this._qAll, name)) {
      return this._qAll[name]
    }
    return null
  }

  queries(name: string): string[] {
    if (Object.prototype.hasOwnProperty.call(this._queries, name)) {
      return this._queries[name]
    }
    const out: string[] = []
    return out
  }

  queryAll(): { [k: string]: string } {
    return this._qAll
  }

  header(name: string): string | null {
    const k = name.toLowerCase()
    if (Object.prototype.hasOwnProperty.call(this._headers, k)) {
      return this._headers[k]
    }
    return null
  }

  body(): string {
    return this._body
  }

  bodyJson(): JsonValue {
    const s = this._body
    try {
      const v: JsonValue = JSON.parse(s)
      return v
    } catch (e) {
      throw new HttpError(400, 'invalid JSON body', null)
    }
  }
}

export class Context {
  readonly req: Ch3Request
  readonly res: http.ServerResponse
  readonly env: { [k: string]: ContextValue }
  sent: boolean
  _headOnly: boolean
  private _vars: { [k: string]: ContextValue }

  constructor(
    req: Ch3Request,
    res: http.ServerResponse,
    env: { [k: string]: ContextValue },
  ) {
    this.req = req
    this.res = res
    this.env = env
    this.sent = false
    this._headOnly = false
    this._vars = {}
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
    this._finish(JSON.stringify(obj))
    return this
  }

  text(s: string): Context {
    this.res.setHeader('content-type', 'text/plain')
    this._finish(s)
    return this
  }

  html(s: string): Context {
    this.res.setHeader('content-type', 'text/html')
    this._finish(s)
    return this
  }

  body(b: Buffer | string): Context {
    this._finish(b)
    return this
  }

  redirect(url: string, code: number): Context {
    this.res.statusCode = code
    this.res.setHeader('location', url)
    this._finish('')
    return this
  }

  private _finish(b: Buffer | string): void {
    if (this._headOnly) {
      this.res.end()
    } else if (typeof b === 'string') {
      this.res.end(b)
    } else {
      this.res.end(b)
    }
    this.sent = true
  }

  set(k: string, v: ContextValue): void {
    this._vars[k] = v
  }

  get(k: string): ContextValue | null {
    if (Object.prototype.hasOwnProperty.call(this._vars, k)) {
      return this._vars[k]
    }
    return null
  }
}

// ---- internal matcher (linear scan — the real core is a radix trie) ----

interface Seg {
  kind: number // 0 static, 1 :param, 2 * splat, 3 :param{regex}
  lit: string
  name: string
  re: RegExp | null
  opt: boolean // :param?
}

interface Entry {
  method: string
  pattern: string
  segs: Seg[]
  handler: Handler
  middleware: Handler[]
}

interface MwRec {
  prefix: string | null
  handler: Handler
}

interface State {
  entries: Entry[]
  mw: MwRec[]
  notFoundH: (c: Context) => void | Context
  onErrorH: (err: HttpError | Error, c: Context) => void | Context
  env: { [k: string]: ContextValue }
  maxBody: number
}

function parsePattern(pattern: string): Seg[] {
  const out: Seg[] = []
  let p = pattern
  if (p.length === 0 || p.charAt(0) !== '/') {
    p = '/' + p
  }
  const parts = p.split('/')
  for (let i = 1; i < parts.length; i++) {
    const s = parts[i]
    if (s === '*') {
      out.push({ kind: 2, lit: '', name: '*', re: null, opt: false })
      continue
    }
    if (s.charAt(0) === ':') {
      let name = s.substring(1)
      let re: RegExp | null = null
      let opt = false
      const b = name.indexOf('{')
      if (b >= 0 && name.charAt(name.length - 1) === '}') {
        re = new RegExp('^' + name.substring(b + 1, name.length - 1) + '$')
        name = name.substring(0, b)
      }
      if (name.charAt(name.length - 1) === '?') {
        opt = true
        name = name.substring(0, name.length - 1)
      }
      if (re === null) {
        out.push({ kind: 1, lit: '', name: name, re: null, opt: opt })
      } else {
        out.push({ kind: 3, lit: '', name: name, re: re, opt: opt })
      }
      continue
    }
    out.push({ kind: 0, lit: s, name: '', re: null, opt: false })
  }
  return out
}

function matchSegs(
  segs: Seg[],
  si: number,
  parts: string[],
  pi: number,
  names: string[],
  vals: string[],
): boolean {
  if (si >= segs.length) {
    return pi >= parts.length
  }
  const seg = segs[si]
  if (seg.kind === 2) {
    names.push(seg.name)
    vals.push(parts.slice(pi).join('/'))
    return true
  }
  if (pi < parts.length) {
    const cur = parts[pi]
    let ok = false
    if (seg.kind === 0) {
      ok = seg.lit === cur
    } else if (seg.kind === 1) {
      ok = true
    } else {
      ok = seg.re !== null && seg.re.test(cur)
    }
    if (ok) {
      if (seg.kind !== 0) {
        names.push(seg.name)
        vals.push(cur)
      }
      if (matchSegs(segs, si + 1, parts, pi + 1, names, vals)) {
        return true
      }
      if (seg.kind !== 0) {
        names.pop()
        vals.pop()
      }
    }
  }
  if (seg.opt) {
    return matchSegs(segs, si + 1, parts, pi, names, vals)
  }
  return false
}

function pathParts(path: string): string[] {
  const raw = path.split('/')
  const out: string[] = []
  for (let i = 1; i < raw.length; i++) {
    if (raw[i].length > 0) {
      out.push(raw[i])
    }
  }
  return out
}

function matchPattern(segs: Seg[], path: string): boolean {
  const parts = pathParts(path)
  const names: string[] = []
  const vals: string[] = []
  return matchSegs(segs, 0, parts, 0, names, vals)
}

interface Found {
  entry: Entry | null
  params: { [k: string]: string }
}

function findMatch(state: State, method: string, path: string): Found {
  const parts = pathParts(path)
  const params: { [k: string]: string } = {}
  for (const e of state.entries) {
    if (e.method !== method) {
      continue
    }
    const names: string[] = []
    const vals: string[] = []
    if (matchSegs(e.segs, 0, parts, 0, names, vals)) {
      for (let i = 0; i < names.length; i++) {
        params[names[i]] = vals[i]
      }
      return { entry: e, params: params }
    }
  }
  return { entry: null, params: params }
}

function allowedMethods(state: State, path: string): string[] {
  const out: string[] = []
  for (const e of state.entries) {
    if (matchPattern(e.segs, path)) {
      if (out.indexOf(e.method) < 0) {
        out.push(e.method)
      }
    }
  }
  return out
}

function pathScoped(path: string, prefix: string): boolean {
  if (prefix === '/') {
    return true
  }
  if (path === prefix) {
    return true
  }
  return path.indexOf(prefix + '/') === 0
}

function decodeQ(s: string): string {
  try {
    return decodeURIComponent(s.split('+').join(' '))
  } catch (e) {
    return s
  }
}

function parseQuery(
  qs: string,
  qAll: { [k: string]: string },
  queries: { [k: string]: string[] },
): void {
  if (qs.length === 0) {
    return
  }
  const pairs = qs.split('&')
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
    const dk = decodeQ(k)
    const dv = decodeQ(v)
    qAll[dk] = dv
    if (Object.prototype.hasOwnProperty.call(queries, dk)) {
      queries[dk].push(dv)
    } else {
      queries[dk] = [dv]
    }
  }
}

function normErr(e: unknown): HttpError | Error {
  if (e instanceof HttpError) {
    return e
  }
  if (e instanceof Error) {
    return e
  }
  const msg = String(e)
  return new Error(msg)
}

function runChain(chain: Handler[], c: Context): void {
  let i = 0
  const next: Next = () => {
    if (i >= chain.length) {
      return
    }
    const h = chain[i]
    i = i + 1
    h(c, next)
  }
  next()
}

function dispatchOne(
  state: State,
  method: string,
  url: string,
  body: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): void {
  let path = url
  let qs = ''
  const qi = url.indexOf('?')
  if (qi >= 0) {
    path = url.substring(0, qi)
    qs = url.substring(qi + 1)
  }
  if (path.length > 1 && path.charAt(path.length - 1) === '/') {
    path = path.substring(0, path.length - 1)
  }
  const qAll: { [k: string]: string } = {}
  const queries: { [k: string]: string[] } = {}
  parseQuery(qs, qAll, queries)
  const headers: { [k: string]: string } = {}
  const hh = req.headers
  const keys = Object.keys(hh)
  for (let i = 0; i < keys.length; i++) {
    const v = hh[keys[i]]
    if (typeof v === 'string') {
      headers[keys[i].toLowerCase()] = v
    } else {
      headers[keys[i].toLowerCase()] = String(v)
    }
  }

  let m = findMatch(state, method, path)
  let headOnly = false
  if (m.entry === null && method === 'HEAD') {
    const m2 = findMatch(state, 'GET', path)
    if (m2.entry !== null) {
      m = m2
      headOnly = true
    }
  }

  const request = new Ch3Request(
    method,
    path,
    req,
    m.params,
    qAll,
    queries,
    headers,
    body,
  )
  const c = new Context(request, res, state.env)
  c._headOnly = headOnly
  const entry = m.entry

  if (entry === null) {
    const allowed = allowedMethods(state, path)
    if (allowed.length > 0) {
      c.status(405)
      c.header('allow', allowed.join(', '))
      c.text('')
      return
    }
    try {
      state.notFoundH(c)
    } catch (e) {
      state.onErrorH(normErr(e), c)
    }
    if (!c.sent) {
      c.res.end()
      c.sent = true
    }
    return
  }

  const chain: Handler[] = []
  for (const r of state.mw) {
    if (r.prefix === null || pathScoped(path, r.prefix)) {
      chain.push(r.handler)
    }
  }
  for (const mw of entry.middleware) {
    chain.push(mw)
  }
  chain.push(entry.handler)
  try {
    runChain(chain, c)
  } catch (e) {
    state.onErrorH(normErr(e), c)
  }
  if (!c.sent) {
    c.res.end()
    c.sent = true
  }
}

function makeHandler(
  state: State,
): (req: http.IncomingMessage, res: http.ServerResponse) => void {
  const h = (req: http.IncomingMessage, res: http.ServerResponse) => {
    const chunks: string[] = []
    let total = 0
    let tooBig = false
    req.on('data', (chunk: Buffer) => {
      const s = chunk.toString()
      chunks.push(s)
      total = total + s.length
      if (total > state.maxBody) {
        tooBig = true
      }
    })
    req.on('end', () => {
      if (tooBig) {
        res.statusCode = 413
        res.end()
        return
      }
      const method: string = req.method || 'GET'
      const url: string = req.url || '/'
      dispatchOne(state, method.toUpperCase(), url, chunks.join(''), req, res)
    })
  }
  return h
}

export interface ServeOpts {
  port: number
  hostname: string | null
  maxBodyBytes: number | null
}

export interface RequestOpts {
  method: string | null
  body: string | null
  headers: { [k: string]: string } | null
}

function serveState(state: State, o: ServeOpts): http.Server {
  if (o.maxBodyBytes !== null) {
    state.maxBody = o.maxBodyBytes
  }
  const server = http.createServer(makeHandler(state))
  if (o.hostname === null) {
    server.listen(o.port)
  } else {
    server.listen(o.port, o.hostname)
  }
  return server
}

function requestState(
  state: State,
  path: string,
  o: RequestOpts | null,
): Promise<unknown> {
  const p = new Promise<unknown>((resolve, reject) => {
    const srv = serveState(state, { port: 0, hostname: null, maxBodyBytes: null })
    srv.on('listening', () => {
      const addr = srv.address() as { port: number }
      const init: { [k: string]: string | { [k: string]: string } } = {}
      init['method'] = o !== null && o.method !== null ? o.method : 'GET'
      if (o !== null && o.body !== null) {
        init['body'] = o.body
      }
      if (o !== null && o.headers !== null) {
        init['headers'] = o.headers
      }
      fetch('http://127.0.0.1:' + String(addr.port) + path, init)
        .then((r) => r.text())
        .then((t) => {
          srv.close()
          resolve(t)
        })
        .catch((e) => {
          srv.close()
          reject(e instanceof Error ? e : new Error(String(e)))
        })
    })
  })
  return p
}

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
  serve(opts: ServeOpts): http.Server
  request(path: string, opts: RequestOpts | null): Promise<unknown>
}

export interface RouterOpts {
  env: { [k: string]: ContextValue } | null
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

// A Ch3App returned as a class instance, not a record of closures: scriptc
// cannot store func-valued record fields on a class instance (SC9001).
class StubRouter implements Ch3App {
  private _state: State

  constructor(state: State) {
    this._state = state
  }

  private _add(method: string, path: string, fns: Handler[]): void {
    const segs = parsePattern(path)
    const mw = fns.slice(0, fns.length - 1)
    const handler = fns[fns.length - 1]
    this._state.entries.push({
      method: method,
      pattern: path,
      segs: segs,
      handler: handler,
      middleware: mw,
    })
  }

  get(path: string, ...fns: Handler[]): Ch3App {
    this._add('GET', path, fns)
    return this
  }

  post(path: string, ...fns: Handler[]): Ch3App {
    this._add('POST', path, fns)
    return this
  }

  put(path: string, ...fns: Handler[]): Ch3App {
    this._add('PUT', path, fns)
    return this
  }

  delete(path: string, ...fns: Handler[]): Ch3App {
    this._add('DELETE', path, fns)
    return this
  }

  patch(path: string, ...fns: Handler[]): Ch3App {
    this._add('PATCH', path, fns)
    return this
  }

  options(path: string, ...fns: Handler[]): Ch3App {
    this._add('OPTIONS', path, fns)
    return this
  }

  head(path: string, ...fns: Handler[]): Ch3App {
    this._add('HEAD', path, fns)
    return this
  }

  all(path: string, ...fns: Handler[]): Ch3App {
    for (let i = 0; i < ALL_METHODS.length; i++) {
      this._add(ALL_METHODS[i], path, fns)
    }
    return this
  }

  use(...args: (string | Handler)[]): Ch3App {
    let prefix: string | null = null
    let start = 0
    if (args.length > 0 && typeof args[0] === 'string') {
      prefix = normalizePrefix(args[0])
      start = 1
    }
    for (let i = start; i < args.length; i++) {
      const a = args[i]
      if (typeof a !== 'string') {
        this._state.mw.push({ prefix: prefix, handler: a })
      }
    }
    return this
  }

  route(prefix: string, sub: Ch3App): Ch3App {
    const p = normalizePrefix(prefix)
    if (!(sub instanceof StubRouter)) {
      throw new Error('route(): sub is not a ch3 app')
    }
    const s = sub._state
    for (const e of s.entries) {
      const joined = joinPath(p, e.pattern)
      this._state.entries.push({
        method: e.method,
        pattern: joined,
        segs: parsePattern(joined),
        handler: e.handler,
        middleware: e.middleware,
      })
    }
    for (const m of s.mw) {
      let mp: string | null = null
      if (m.prefix === null) {
        mp = p
      } else {
        mp = joinPath(p, m.prefix)
      }
      this._state.mw.push({ prefix: mp, handler: m.handler })
    }
    return this
  }

  notFound(h: (c: Context) => void | Context): Ch3App {
    this._state.notFoundH = h
    return this
  }

  onError(h: (err: HttpError | Error, c: Context) => void | Context): Ch3App {
    this._state.onErrorH = h
    return this
  }

  handler(): (req: http.IncomingMessage, res: http.ServerResponse) => void {
    return makeHandler(this._state)
  }

  serve(o: ServeOpts): http.Server {
    return serveState(this._state, o)
  }

  request(path: string, o: RequestOpts | null): Promise<unknown> {
    return requestState(this._state, path, o)
  }
}

export function createRouter(opts: RouterOpts | null = null): Ch3App {
  const state: State = {
    entries: [],
    mw: [],
    notFoundH: (c: Context) => {
      c.status(404)
      c.text('')
      return c
    },
    onErrorH: (err: HttpError | Error, c: Context) => {
      const st = err instanceof HttpError ? err.status : 500
      if (!c.sent) {
        c.status(st)
        c.text('')
      }
      return c
    },
    env: opts !== null && opts.env !== null ? opts.env : {},
    maxBody: 1048576,
  }
  const app: Ch3App = new StubRouter(state)
  return app
}
