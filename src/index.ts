// @sigilco/ch3 — minimal synchronous HTTP router for node:http.
// Authored inside the scriptc compilable subset so `scriptc build` can
// statically lower the whole package into a native binary:
//   - sync handlers only; `| null` unions, never `| undefined`
//   - plain ({}) records for route data; real classes for Ctx/ReqView/App
//   - indexed `for` loops only; `.pop()` statements, never expressions
//   - no object/method shorthand in literals, no `?.`/`??`, no eval/new Function
//   - no Object.create(null)/freeze, no Map/Set/RegExp on the hot path
//   - no spread, no array slice/concat on package paths (SC2020)
//   - no function values inside records — handlers live in App._fns and
//     nodes store numeric indices (function-typed record fields degrade
//     the instantiation to `unknown` and fence every method call on them)
//   - no recursion for matching — an explicit frame stack; recursive calls
//     monomorphize an `unknown` instantiation that fences lazy sites
//   - String(x)/Number(x) coercion at function entry for params that
//     arrive `unknown` (SC1090 "string methods as values")
//   - body via req.on('data'|'end') + string concat (Buffer.concat unlowered)
//   - res.end() always statement-called (result use is deferred)

import * as http from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export class ReqView<P extends string = string> {
  raw: IncomingMessage
  method: string
  path: string
  _pm: string[]
  _qs: string
  _qp: string[] | null
  _body: string

  constructor(raw: IncomingMessage, pm: string[], qs: string, path: string) {
    this.raw = raw
    this.method = String(raw.method || '')
    this._pm = pm
    this._qs = String(qs)
    this._qp = null
    this._body = ''
    this.path = String(path)
  }

  param(name: ParamKey<P>): string | null {
    const n = String(name)
    const pm = this._pm
    for (let i = 0; i < pm.length; i += 2) {
      if (pm[i] === n) {
        return String(pm[i + 1])
      }
    }
    return null
  }

  query(name: string): string | null {
    const n = String(name)
    const qp = this._parsed()
    for (let i = 0; i < qp.length; i += 2) {
      if (qp[i] === n) {
        return String(qp[i + 1])
      }
    }
    return null
  }

  queryAll(): Record<string, string> {
    const qp = this._parsed()
    const out: Record<string, string> = {}
    for (let i = 0; i < qp.length; i += 2) {
      const k = String(qp[i])
      out[k] = String(qp[i + 1])
    }
    return out
  }

  header(name: string): string | null {
    const key = String(name).toLowerCase()
    const v = this.raw.headers[key]
    if (v === undefined || v === null) {
      return null
    }
    if (typeof v === 'string') {
      return String(v)
    }
    if (v.length > 0) {
      return String(v[0])
    }
    return null
  }

  body(): string {
    return String(this._body)
  }

  _setBody(s: string): void {
    this._body = String(s)
  }

  _parsed(): string[] {
    const cached = this._qp
    if (cached !== null) {
      return cached
    }
    const out: string[] = []
    const qs = String(this._qs)
    if (qs.length > 0) {
      const parts = qs.split('&')
      for (let i = 0; i < parts.length; i++) {
        const p = String(parts[i])
        const eq = p.indexOf('=')
        if (eq < 0) {
          out.push(dec(p))
          out.push('')
        } else {
          out.push(dec(p.slice(0, eq)))
          out.push(dec(p.slice(eq + 1)))
        }
      }
    }
    this._qp = out
    return out
  }
}

export class Ctx<P extends string = string> {
  req: ReqView<P>
  res: ServerResponse
  _status: number

  constructor(req: ReqView<P>, res: ServerResponse) {
    this.req = req
    this.res = res
    this._status = 200
  }

  status(n: number): Ctx<P> {
    const code = Number(n)
    this._status = code
    this.res.statusCode = code
    return this
  }

  header(k: string, v: string): Ctx<P> {
    this.res.setHeader(String(k), String(v))
    return this
  }

  json(o: unknown): Ctx<P> {
    const t = JSON.stringify(o)
    let s = 'null'
    if (typeof t === 'string') {
      s = t
    }
    return this._send(s, 'application/json; charset=utf-8')
  }

  text(s: string): Ctx<P> {
    return this._send(String(s), 'text/plain; charset=utf-8')
  }

  html(s: string): Ctx<P> {
    return this._send(String(s), 'text/html; charset=utf-8')
  }

  redirect(url: string): Ctx<P>
  redirect(url: string, code: number): Ctx<P>
  redirect(url: string, code?: number): Ctx<P> {
    const n = code === null || code === undefined ? 302 : Number(code)
    this.status(n)
    this.res.setHeader('location', String(url))
    this.res.end()
    return this
  }

  _send(s: string, ct: string): Ctx<P> {
    const b = String(s)
    this.res.statusCode = this._status
    this.res.setHeader('content-type', ct)
    this.res.setHeader('content-length', String(utf8len(b)))
    this.res.end(b)
    return this
  }
}

// Param names inferred from a path literal: '/user/:id' -> 'id',
// '/a/:x/b/:y' -> 'x' | 'y', '/w/*' -> '*'. Degrades to `string` when the
// path has no params so param() never becomes uncallable.
export type ParamKey<P extends string> =
  P extends `${infer _Head}:${infer Rest}`
    ? Rest extends `${infer K}/${infer Tail}`
      ? K | ParamKey<`/${Tail}`>
      : Rest | (P extends `${string}/*` ? '*' : never)
    : P extends `${string}/*`
      ? '*'
      : string

export type Handler = (c: Ctx) => void
export type Next = () => void
export type Middleware = (c: Ctx, next: Next) => void

// ---------------------------------------------------------------------------
// Route table: a trie of plain records. kinds: 0 static, 1 :param, 2 * wildcard.
// Handlers are stored as indices into App._fns (never function values in
// records); methods and middleware snapshots sit in parallel arrays.
// ---------------------------------------------------------------------------

interface RouteNode {
  seg: string
  kind: number
  children: RouteNode[]
  hm: string[]
  hw: Middleware[][]
  hf: number[]
}

interface Frame {
  node: RouteNode
  i: number
  pmlen: number
  pname: string | null
  pval: string | null
}

function newNode(seg: string, kind: number): RouteNode {
  return {
    seg: String(seg),
    kind: Number(kind),
    children: [],
    hm: [],
    hw: [],
    hf: [],
  }
}

function addRoute(root: RouteNode, method: string, path: string, hIdx: number, mw: Middleware[]): void {
  const m = String(method)
  const p = String(path)
  if (p === '' || p.charAt(0) !== '/') {
    throw new Error('ch3: route path must start with /')
  }
  const segs = p.split('/')
  let node = root
  for (let i = 1; i < segs.length; i++) {
    let seg = String(segs[i])
    let kind = 0
    if (seg === '*') {
      kind = 2
      if (i !== segs.length - 1) {
        throw new Error('ch3: * wildcard must be the last path segment')
      }
    } else if (seg.charAt(0) === ':') {
      kind = 1
      seg = String(seg.slice(1))
      if (seg === '') {
        throw new Error('ch3: empty :param name in ' + p)
      }
    }
    let child: RouteNode | null = null
    const ch = node.children
    for (let k = 0; k < ch.length; k++) {
      const c = ch[k]
      if (c.kind === kind && c.seg === seg) {
        child = c
        break
      }
    }
    if (child === null) {
      child = newNode(seg, kind)
      ch.push(child)
    }
    node = child
  }
  node.hm.push(m)
  node.hw.push(mw)
  node.hf.push(hIdx)
}

// Depth-first match over an explicit frame stack (no recursion — recursive
// calls monomorphize an unknown instantiation). Children are pushed
// wildcard → param → static so static pops first; pm unwinds on backtrack
// by truncating to the frame's recorded length.
function matchNode(root: RouteNode, segs: string[], pm: string[]): RouteNode | null {
  let node = root
  let i = 1
  let dive = i < segs.length
  while (dive) {
    const seg = String(segs[i])
    const ch = node.children
    let next: RouteNode | null = null
    let alt = false
    for (let k = 0; k < ch.length; k++) {
      const c = ch[k]
      if (c.kind === 0 && c.seg === seg) {
        next = c
      } else if (c.kind !== 0) {
        alt = true
      }
    }
    if (alt || next === null) {
      dive = false
    } else {
      node = next
      i = i + 1
      dive = i < segs.length
    }
  }
  if (i >= segs.length && node.hf.length > 0) {
    return node
  }
  const stack: Frame[] = []
  stack.push({ node: node, i: i, pmlen: pm.length, pname: null, pval: null })
  while (stack.length > 0) {
    const f = stack[stack.length - 1]
    stack.pop()
    while (pm.length > f.pmlen) {
      pm.pop()
    }
    const pn = f.pname
    if (pn !== null && f.pval !== null) {
      pm.push(pn)
      pm.push(f.pval)
    }
    const node = f.node
    const i = Number(f.i)
    if (i >= segs.length) {
      if (node.hf.length > 0) {
        return node
      }
      continue
    }
    const seg = String(segs[i])
    const ch = node.children
    const base = pm.length
    let tail: string | null = null
    for (let k = ch.length - 1; k >= 0; k--) {
      const c = ch[k]
      if (c.kind === 2) {
        if (tail === null) {
          tail = ''
          for (let j = i; j < segs.length; j++) {
            if (j > i) {
              tail = tail + '/'
            }
            tail = tail + String(segs[j])
          }
        }
        stack.push({ node: c, i: segs.length, pmlen: base, pname: '*', pval: dec(tail) })
      }
    }
    for (let k = ch.length - 1; k >= 0; k--) {
      const c = ch[k]
      if (c.kind === 1) {
        stack.push({ node: c, i: i + 1, pmlen: base, pname: String(c.seg), pval: dec(seg) })
      }
    }
    for (let k = ch.length - 1; k >= 0; k--) {
      const c = ch[k]
      if (c.kind === 0 && c.seg === seg) {
        stack.push({ node: c, i: i + 1, pmlen: base, pname: null, pval: null })
      }
    }
  }
  return null
}

function findEntry(node: RouteNode, method: string): number {
  const m = String(method)
  const hm = node.hm
  let star = -1
  for (let i = 0; i < hm.length; i++) {
    if (hm[i] === m) {
      return i
    }
    if (hm[i] === '*' && star < 0) {
      star = i
    }
  }
  if (star >= 0) {
    return star
  }
  if (m === 'HEAD') {
    for (let i = 0; i < hm.length; i++) {
      if (hm[i] === 'GET') {
        return i
      }
    }
  }
  return -1
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function defaultNotFound(c: Ctx): void {
  c.status(404)
  c.text('Not Found')
}

function send500(res: ServerResponse): void {
  try {
    if (res.headersSent) {
      res.destroy()
    } else {
      res.statusCode = 500
      res.setHeader('content-type', 'text/plain; charset=utf-8')
      res.setHeader('content-length', '21')
      res.end('Internal Server Error')
    }
  } catch (e) {
    try {
      res.destroy()
    } catch (e2) {
      // socket already gone
    }
  }
}

function utf8len(s: string): number {
  const b = String(s)
  let n = 0
  for (let i = 0; i < b.length; i++) {
    const c = b.charCodeAt(i)
    if (c < 0x80) {
      n = n + 1
    } else if (c < 0x800) {
      n = n + 2
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < b.length) {
      const c2 = b.charCodeAt(i + 1)
      if (c2 >= 0xdc00 && c2 <= 0xdfff) {
        n = n + 4
        i = i + 1
      } else {
        n = n + 3
      }
    } else {
      n = n + 3
    }
  }
  return n
}

function dec(s: string): string {
  const t = String(s).split('+').join(' ')
  try {
    return decodeURIComponent(t)
  } catch (e) {
    return t
  }
}

function copyMw(mw: Middleware[]): Middleware[] {
  const out: Middleware[] = []
  for (let i = 0; i < mw.length; i++) {
    out.push(mw[i])
  }
  return out
}

function mergeMw(a: Middleware[], b: Middleware[]): Middleware[] {
  const out: Middleware[] = []
  for (let i = 0; i < a.length; i++) {
    out.push(a[i])
  }
  for (let i = 0; i < b.length; i++) {
    out.push(b[i])
  }
  return out
}

function mountRoutes(n: RouteNode, acc: string, prefix: string, pre: Middleware[], app: App, sub: App): void {
  const a = String(acc)
  const hs = n.hf
  if (hs.length > 0) {
    let path = String(prefix) + a
    if (path === '') {
      path = '/'
    }
    for (let i = 0; i < hs.length; i++) {
      const idx = app._regFn(sub._fns[hs[i]])
      addRoute(app._root, n.hm[i], path, idx, mergeMw(pre, n.hw[i]))
    }
  }
  const ch = n.children
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i]
    let seg = String(c.seg)
    if (c.kind === 1) {
      seg = ':' + seg
    }
    mountRoutes(c, a + '/' + seg, prefix, pre, app, sub)
  }
}

export class App {
  _root: RouteNode
  _mw: Middleware[]
  _fns: Handler[]
  _nf: Handler
  _nfmw: Middleware[]

  constructor() {
    this._root = newNode('', 0)
    this._mw = []
    this._fns = []
    this._nf = defaultNotFound
    this._nfmw = []
  }

  get<P extends string>(path: P, h: (c: Ctx<P>) => void): App {
    return this._add('GET', path, h as Handler)
  }

  post<P extends string>(path: P, h: (c: Ctx<P>) => void): App {
    return this._add('POST', path, h as Handler)
  }

  put<P extends string>(path: P, h: (c: Ctx<P>) => void): App {
    return this._add('PUT', path, h as Handler)
  }

  delete<P extends string>(path: P, h: (c: Ctx<P>) => void): App {
    return this._add('DELETE', path, h as Handler)
  }

  patch<P extends string>(path: P, h: (c: Ctx<P>) => void): App {
    return this._add('PATCH', path, h as Handler)
  }

  head<P extends string>(path: P, h: (c: Ctx<P>) => void): App {
    return this._add('HEAD', path, h as Handler)
  }

  options<P extends string>(path: P, h: (c: Ctx<P>) => void): App {
    return this._add('OPTIONS', path, h as Handler)
  }

  all<P extends string>(path: P, h: (c: Ctx<P>) => void): App {
    return this._add('*', path, h as Handler)
  }

  on<P extends string>(method: string, path: P, h: (c: Ctx<P>) => void): App {
    return this._add(String(method).toUpperCase(), path, h as Handler)
  }

  use(fn: Middleware): App {
    this._mw.push(fn)
    return this
  }

  notFound(h: (c: Ctx) => void): App {
    this._nf = h as Handler
    this._nfmw = copyMw(this._mw)
    return this
  }

  route(prefix: string, sub: App): App {
    let p = String(prefix)
    if (p.length > 1 && p.charAt(p.length - 1) === '/') {
      p = String(p.slice(0, p.length - 1))
    }
    mountRoutes(sub._root, '', p, copyMw(this._mw), this, sub)
    return this
  }

  handler(): (req: IncomingMessage, res: ServerResponse) => void {
    const app = this
    return function (req: IncomingMessage, res: ServerResponse): void {
      app._dispatch(req, res)
    }
  }

  serve(opts: { port: number }): Server
  serve(opts: { port: number; host: string }): Server
  serve(opts: { port: number; host?: string }): Server {
    const s = http.createServer(this.handler())
    if (opts.host === null || opts.host === undefined) {
      s.listen(Number(opts.port))
    } else {
      s.listen(Number(opts.port), String(opts.host))
    }
    return s
  }

  _regFn(h: Handler): number {
    this._fns.push(h)
    return this._fns.length - 1
  }

  _add(method: string, path: string, h: Handler): App {
    const idx = this._regFn(h)
    addRoute(this._root, method, path, idx, copyMw(this._mw))
    return this
  }

  _dispatch(req: IncomingMessage, res: ServerResponse): void {
    const method: string = String(req.method || '')
    const url: string = String(req.url || '/')
    let path = url
    let qs = ''
    const qi = url.indexOf('?')
    if (qi >= 0) {
      path = String(url.slice(0, qi))
      qs = String(url.slice(qi + 1))
    }
    const pm: string[] = []
    const segs = path.split('/')
    const node = matchNode(this._root, segs, pm)
    let h = this._nf
    let mw = this._nfmw
    if (node !== null) {
      const j = findEntry(node, method)
      if (j >= 0) {
        h = this._fns[node.hf[j]]
        mw = node.hw[j]
      }
    }
    const rv = new ReqView(req, pm, qs, path)
    const c = new Ctx(rv, res)
    const self = this
    if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
      let buf = ''
      req.on('data', function (chunk: { toString(): string }): void {
        buf = buf + String(chunk)
      })
      req.on('end', function (): void {
        rv._setBody(buf)
        try {
          self._chain(c, mw, h, 0)
        } catch (e) {
          send500(res)
        }
      })
    } else {
      try {
        this._chain(c, mw, h, 0)
      } catch (e) {
        send500(res)
      }
    }
  }

  _chain(c: Ctx, mw: Middleware[], h: Handler, i: number): void {
    if (i < mw.length) {
      const fn = mw[i]
      const self = this
      fn(c, function (): void {
        self._chain(c, mw, h, i + 1)
      })
    } else {
      h(c)
    }
  }
}

export function createRouter(): App {
  return new App()
}
