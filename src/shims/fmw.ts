// src/shims/fmw.ts — `ch3/fmw`: a find-my-way-compatible surface over a
// Ch3Core radix trie. Pure re-mapping layer: zero code from find-my-way.
//
// Coverage target: ~90% of `on`/`find` usage (DESIGN.md §4).
//   on / register / off / find / all / defaultRoute / lookup / prettyPrint
//   `:param`, `*`, `:p?`, `:p(re)` — same pattern semantics
//   versioned + host constraints, caseSensitive, maxParamLength
//
// Divergences (also in docs/shims/fmw.md once docs land):
//   - version matching is semver-LITE: exact + `x`-ranges + `^caret` only.
//     No `-` hyphen ranges, `||` unions, `>=` comparators, tildes, prereleases.
//   - no constraint-solver plugin API, no async find hooks
//   - `register(routes)` is a ch3 bulk-register extension (fmw has no register)
//   - prettyPrint output is a plain indented tree, not fmw's radix dump
//   - same-segment multi-param (`:a-:b`) and param-mid-segment (`x:y`) are
//     registration-time errors
//   - `lookup` returns 405 + Allow on method-miss (fastify-style; real fmw
//     defers to defaultRoute)
//   - find returns `{handler, params, store, searchParams}` plain record;
//     searchParams is `{k: string | string[]}` (fmw uses its qs parser shape)
//   - trailing-slash normalization is always on (ch3 core semantics);
//     ignoreDuplicateSlashes option collapses `//` runs

import type { IncomingMessage, ServerResponse } from 'node:http'
import { createCore } from './fmw-core-bind.ts'
import type { Ch3Core, Context, Handler, Next } from './fmw-core-bind.ts'

export type FmwStore = string | number | boolean | null | { [k: string]: string | number | boolean | null }
export interface FmwParams {
  [k: string]: string
}
export interface FmwSearchParams {
  [k: string]: string | string[]
}
export type FmwHandler = (req: IncomingMessage, res: ServerResponse, params: FmwParams, store: FmwStore, searchParams: FmwSearchParams) => void

export interface FmwConstraints {
  version: string | null
  host: string | null
}

export interface FmwOnOpts {
  version?: string | null
  host?: string | null
  constraints?: FmwConstraints | null
}

export interface FmwRouteDef {
  method: string | string[]
  path?: string | null
  url?: string | null
  handler: FmwHandler
  opts?: FmwOnOpts | null
  store?: FmwStore | null
  version?: string | null
  host?: string | null
  constraints?: FmwConstraints | null
}

export interface FmwRouteInfo {
  method: string
  path: string
  handler: FmwHandler
  store: FmwStore
  version: string | null
  host: string | null
}

export interface FmwFindResult {
  handler: FmwHandler
  params: FmwParams
  store: FmwStore
  searchParams: FmwSearchParams
  version: string | null
  host: string | null
}

export interface FmwOptions {
  defaultRoute?: FmwHandler | null
  caseSensitive?: boolean | null
  maxParamLength?: number | null
  ignoreTrailingSlash?: boolean | null
  ignoreDuplicateSlashes?: boolean | null
  allowUnsafeRegex?: boolean | null
  versioning?: { [k: string]: string | number | boolean | null } | null
  querystringParser?: unknown
}

// ---------- pattern parsing ----------

const SEG_STATIC = 0
const SEG_PARAM = 1
const SEG_WILD = 2

interface FSeg {
  kind: number
  name: string
  regex: RegExp | null
}

interface FPattern {
  canonical: string
  variants: FSeg[][]
  paramNames: string[]
  corePath: string
}

function isNameChar(c: number): boolean {
  return (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c === 95
}

function parsePattern(raw: string, caseFold: boolean): FPattern {
  let p = raw
  if (!p.startsWith('/')) throw new Error("route pattern must start with '/': " + raw)
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, p.length - 1)
  if (caseFold) p = p.toLowerCase()
  const parts = p.split('/')
  const base: FSeg[] = []
  const names: string[] = []
  const optIdx: number[] = []
  let corePath = ''
  for (let i = 0; i < parts.length; i++) {
    const s = parts[i]
    if (s === '') continue
    if (s === '*') {
      if (i !== parts.length - 1) throw new Error("'*' wildcard is only valid as the last segment: " + raw)
      base.push({ kind: SEG_WILD, name: '*', regex: null })
      names.push('*')
      corePath += '/*'
      continue
    }
    if (s.charCodeAt(0) === 58) {
      // ':name' with optional '(re)' and trailing '?'
      let body = s.slice(1)
      let optional = false
      if (body.endsWith('?')) {
        optional = true
        body = body.slice(0, body.length - 1)
      }
      let name = body
      let re: RegExp | null = null
      const par = body.indexOf('(')
      if (par >= 0) {
        if (!body.endsWith(')')) throw new Error('unbalanced regex group in segment: ' + s)
        name = body.slice(0, par)
        const rex = body.slice(par + 1, body.length - 1)
        re = new RegExp('^(?:' + rex + ')$')
      }
      if (name === '') throw new Error('empty param name in segment: ' + s)
      for (let j = 0; j < name.length; j++) {
        const cc = name.charCodeAt(j)
        if (cc === 58) throw new Error('same-segment multi-param (:a-:b) is not supported: ' + s)
        if (!isNameChar(cc)) throw new Error('bad param name in segment: ' + s)
      }
      names.push(name)
      base.push({ kind: SEG_PARAM, name: name, regex: re })
      corePath += '/:' + name + (re === null ? '' : '{' + body.slice(par + 1, body.length - 1) + '}') + (optional ? '?' : '')
      if (optional) optIdx.push(base.length - 1)
      continue
    }
    if (s.indexOf(':') >= 0) throw new Error('param must start the segment (:p mid-segment unsupported): ' + s)
    base.push({ kind: SEG_STATIC, name: s, regex: null })
    corePath += '/' + s
  }
  if (corePath === '') corePath = '/'
  if (optIdx.length > 3) throw new Error('more than 3 optional params in pattern: ' + raw)
  // expand variants: bitmask over optional positions
  const variants: FSeg[][] = []
  const total = 1 << optIdx.length
  for (let mask = 0; mask < total; mask++) {
    const v: FSeg[] = []
    let optSeen = 0
    for (let i = 0; i < base.length; i++) {
      const isOpt = optIdx.indexOf(i) >= 0
      if (isOpt) {
        const keep = (mask & (1 << optSeen)) !== 0
        optSeen += 1
        if (keep) v.push(base[i])
      } else {
        v.push(base[i])
      }
    }
    variants.push(v)
  }
  // dedupe param names (expansion keeps name list of base)
  const dedup: string[] = []
  for (let i = 0; i < names.length; i++) {
    if (names[i] !== '*' && dedup.indexOf(names[i]) < 0) dedup.push(names[i])
    if (names[i] === '*' && dedup.indexOf('*') < 0) dedup.push('*')
  }
  return { canonical: p, variants: variants, paramNames: dedup, corePath: corePath }
}

// ---------- semver-lite ----------
// exact:  '1.2.3' | '1.2' | '1'   (missing parts are wildcards, range-style)
// x-range: '1.x' | '1.2.x' | 'x' | '*'
// caret:   '^1.2.3' | '^1.2' | '^1'  (standard npm caret bounds)
// Everything else (hyphen ranges, ||, >=, tildes, prerelease) is a documented
// divergence and never matches.

interface VTriple {
  major: number
  minor: number
  patch: number
  wMinor: boolean
  wPatch: boolean
  any: boolean
  ok: boolean
}

function parseVTriple(s: string): VTriple {
  const parts = s.split('.')
  const out: VTriple = { major: 0, minor: 0, patch: 0, wMinor: false, wPatch: false, any: false, ok: true }
  if (parts.length > 3) {
    out.ok = false
    return out
  }
  const vals: number[] = [0, 0, 0]
  for (let i = 0; i < parts.length; i++) {
    const t = parts[i]
    if (t === 'x' || t === 'X' || t === '*') {
      if (i === 0) out.any = true
      if (i === 1) out.wMinor = true
      if (i === 2) out.wPatch = true
      continue
    }
    if (t === '' || !/^\d+$/.test(t)) {
      out.ok = false
      return out
    }
    vals[i] = Number(t)
  }
  out.major = vals[0]
  out.minor = vals[1]
  out.patch = vals[2]
  if (parts.length === 1) {
    out.wMinor = true
    out.wPatch = true
  } else if (parts.length === 2) {
    out.wPatch = true
  }
  return out
}

function vcmp(a: VTriple, b: VTriple): number {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  return a.patch - b.patch
}

function versionSatisfies(spec: string, declared: string): boolean {
  const d = parseVTriple(declared)
  if (!d.ok) return false
  const s = spec.trim()
  if (s === '' || s === '*' || s === 'x' || s === 'X') return true
  if (s.charCodeAt(0) === 94) {
    // caret range
    const lo = parseVTriple(s.slice(1))
    if (!lo.ok || lo.any) return false
    if (vcmp(d, lo) < 0) return false
    if (lo.major > 0) return d.major === lo.major
    if (lo.minor > 0) return d.major === 0 && d.minor === lo.minor
    return d.major === 0 && d.minor === 0 && d.patch === lo.patch
  }
  const v = parseVTriple(s)
  if (!v.ok) return false
  if (v.any) return true
  if (v.major !== d.major) return false
  if (!v.wMinor && v.minor !== d.minor) return false
  if (!v.wPatch && v.patch !== d.patch) return false
  return true
}

function versionCmp(a: string, b: string): number {
  return vcmp(parseVTriple(a), parseVTriple(b))
}

function hostMatches(want: string, declared: string): boolean {
  const w = want.toLowerCase()
  const d = declared.toLowerCase()
  if (d.startsWith('*.')) {
    // *.example.com matches sub.example.com (and deeper), not example.com
    const apex = d.slice(1)
    return w.endsWith(apex) && w.length > apex.length
  }
  return w === d
}

// ---------- helpers ----------

function splitQuery(url: string): { path: string; search: FmwSearchParams } {
  const sp: FmwSearchParams = {}
  const i = url.indexOf('?')
  if (i < 0) return { path: url, search: sp }
  const pairs = url.slice(i + 1).split('&')
  for (let k = 0; k < pairs.length; k++) {
    const p = pairs[k]
    if (p === '') continue
    const e = p.indexOf('=')
    const key = e < 0 ? p : p.slice(0, e)
    const val = e < 0 ? '' : p.slice(e + 1)
    if (Object.keys(sp).indexOf(key) < 0) {
      sp[key] = val
    } else {
      const cur = sp[key]
      if (typeof cur === 'string') {
        sp[key] = [cur, val]
      } else {
        cur.push(val)
      }
    }
  }
  return { path: url.slice(0, i), search: sp }
}

function matchVariant(segs: FSeg[], pathSegs: string[]): { [k: string]: string } | null {
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
      if (s.regex !== null && s.regex.exec(value) === null) return null
      params[s.name] = value
    }
    pi += 1
  }
  if (pi !== pathSegs.length) return null
  return params
}

function variantScore(segs: FSeg[]): number[] {
  const score: number[] = []
  for (let i = 0; i < segs.length; i++) {
    const k = segs[i].kind
    score.push(k === SEG_STATIC ? 2 : k === SEG_PARAM ? 1 : 0)
  }
  return score
}

function rejectAsync(h: FmwHandler): void {
  if (h.constructor.name === 'AsyncFunction') throw new Error('async handlers unsupported under ch3')
}

interface FRec {
  method: string
  path: string
  canonical: string
  pattern: FPattern
  handler: FmwHandler
  wrapper: Handler
  store: FmwStore
  version: string | null
  host: string | null
  order: number
}

export class FmwRouter {
  core: Ch3Core
  routes: FRec[]
  counter: number
  caseSensitive: boolean
  collapseSlashes: boolean
  maxParamLength: number
  defaultRoute: FmwHandler | null

  constructor(opts: FmwOptions | null) {
    this.core = createCore()
    this.routes = []
    this.counter = 0
    this.defaultRoute = null
    this.caseSensitive = true
    this.collapseSlashes = false
    this.maxParamLength = 100
    if (opts !== null) {
      if ('caseSensitive' in opts && opts.caseSensitive !== null && opts.caseSensitive !== undefined) this.caseSensitive = opts.caseSensitive
      if ('maxParamLength' in opts && opts.maxParamLength !== null && opts.maxParamLength !== undefined) this.maxParamLength = Number(opts.maxParamLength)
      if ('ignoreDuplicateSlashes' in opts && opts.ignoreDuplicateSlashes !== null && opts.ignoreDuplicateSlashes !== undefined) this.collapseSlashes = opts.ignoreDuplicateSlashes
      if ('versioning' in opts && opts.versioning !== null && opts.versioning !== undefined) {
        throw new Error('custom versioning strategies are unsupported under ch3 (semver-lite built in)')
      }
      if ('querystringParser' in opts && opts.querystringParser !== null && opts.querystringParser !== undefined) {
        throw new Error('custom querystringParser is unsupported under ch3')
      }
      if ('defaultRoute' in opts && opts.defaultRoute !== null && opts.defaultRoute !== undefined) {
        rejectAsync(opts.defaultRoute)
        this.defaultRoute = opts.defaultRoute
      }
    }
  }

  _norm(p: string): string {
    let out = p
    if (this.collapseSlashes) {
      while (out.indexOf('//') >= 0) out = out.split('//').join('/')
    }
    if (out.length > 1 && out.endsWith('/')) out = out.slice(0, out.length - 1)
    if (!this.caseSensitive) out = out.toLowerCase()
    return out
  }

  _decode(p: string): string {
    try {
      return decodeURIComponent(p)
    } catch {
      return p
    }
  }

  _recOf(wrapper: Handler): FRec | null {
    for (let i = 0; i < this.routes.length; i++) {
      if (this.routes[i].wrapper === wrapper) return this.routes[i]
    }
    return null
  }

  _paramsOk(params: { [k: string]: string }): boolean {
    const keys = Object.keys(params)
    for (let i = 0; i < keys.length; i++) {
      if (params[keys[i]].length > this.maxParamLength) return false
    }
    return true
  }

  _constraintPass(rec: FRec, wantVersion: string | null, wantHost: string | null): boolean {
    if (rec.version !== null) {
      if (wantVersion === null) return false
      if (!versionSatisfies(wantVersion, rec.version)) return false
    }
    if (rec.host !== null) {
      if (wantHost === null) return false
      if (!hostMatches(wantHost, rec.host)) return false
    }
    return true
  }

  _result(rec: FRec, params: { [k: string]: string }, search: FmwSearchParams): FmwFindResult {
    return { handler: rec.handler, params: params, store: rec.store, searchParams: search, version: rec.version, host: rec.host }
  }

  _scan(method: string, path: string, wantVersion: string | null, wantHost: string | null, search: FmwSearchParams): FmwFindResult | null {
    const pathSegs: string[] = []
    const rawSegs = path.split('/')
    for (let i = 0; i < rawSegs.length; i++) {
      if (rawSegs[i] !== '') pathSegs.push(rawSegs[i])
    }
    let best: FRec | null = null
    let bestParams: { [k: string]: string } | null = null
    let bestScore: number[] | null = null
    let bestSpecific = -1
    for (let i = 0; i < this.routes.length; i++) {
      const rec = this.routes[i]
      if (rec.method !== method) continue
      if (!this._constraintPass(rec, wantVersion, wantHost)) continue
      let params: { [k: string]: string } | null = null
      let score: number[] | null = null
      for (let v = 0; v < rec.pattern.variants.length; v++) {
        const variant = rec.pattern.variants[v]
        const p = matchVariant(variant, pathSegs)
        if (p !== null) {
          params = p
          score = variantScore(variant)
          break
        }
      }
      if (params === null || score === null) continue
      if (!this._paramsOk(params)) continue
      // constraint specificity: versioned+hosted beats plain when the request asks
      let specific = 0
      if (rec.version !== null) specific += 2
      if (rec.host !== null) specific += 1
      let wins = false
      if (best === null || bestScore === null) {
        wins = true
      } else if (specific !== bestSpecific) {
        wins = specific > bestSpecific
      } else {
        for (let s = 0; s < score.length && s < bestScore.length; s++) {
          if (score[s] !== bestScore[s]) {
            wins = score[s] > bestScore[s]
            break
          }
        }
        if (!wins && rec.version !== null && (best === null || best.version === null || versionCmp(rec.version, best.version) > 0)) {
          wins = true
        }
      }
      if (wins) {
        best = rec
        bestParams = params
        bestScore = score
        bestSpecific = specific
      }
    }
    if (best === null || bestParams === null) return null
    return this._result(best, bestParams, search)
  }

  on(method: string | string[], path: string, a3?: FmwOnOpts | FmwHandler | null, a4?: FmwHandler | FmwStore | null, a5?: FmwStore | null): FmwRouter {
    let opts: FmwOnOpts | null = null
    let handler: FmwHandler | null = null
    let store: FmwStore = null
    if (typeof a3 === 'function') {
      handler = a3
      if (a4 !== null && a4 !== undefined && typeof a4 !== 'function') store = a4
    } else {
      opts = a3 === undefined ? null : a3
      if (typeof a4 === 'function') handler = a4
      if (a5 !== null && a5 !== undefined) store = a5
    }
    if (handler === null) throw new Error('missing handler for route ' + path)
    rejectAsync(handler)
    let version: string | null = null
    let host: string | null = null
    if (opts !== null) {
      if ('version' in opts && opts.version !== null && opts.version !== undefined) version = String(opts.version)
      if ('host' in opts && opts.host !== null && opts.host !== undefined) host = String(opts.host)
      if ('constraints' in opts && opts.constraints !== null && opts.constraints !== undefined) {
        const c = opts.constraints
        if ('version' in c && c.version !== null && c.version !== undefined) version = String(c.version)
        if ('host' in c && c.host !== null && c.host !== undefined) host = String(c.host)
      }
    }
    const pattern = parsePattern(this._norm(path), false)
    const methods: string[] = typeof method === 'string' ? [method] : method
    for (let m = 0; m < methods.length; m++) {
      const meth = methods[m].toUpperCase()
      for (let i = 0; i < this.routes.length; i++) {
        const rec = this.routes[i]
        if (rec.method === meth && rec.canonical === pattern.canonical && rec.version === version && rec.host === host) {
          throw new Error("Method '" + meth + "' already declared for route '" + path + "'")
        }
      }
      const names: string[] = []
      for (let i = 0; i < pattern.paramNames.length; i++) names.push(pattern.paramNames[i])
      const h = handler
      const st = store
      const wrapper: Handler = (c: Context, _next: Next) => {
        const ps: FmwParams = {}
        for (let i = 0; i < names.length; i++) {
          const v = c.req.param(names[i])
          if (v !== null) ps[names[i]] = v
        }
        const qa = c.req.queryAll()
        const sp: FmwSearchParams = {}
        const qk = Object.keys(qa)
        for (let i = 0; i < qk.length; i++) sp[qk[i]] = qa[qk[i]]
        h(c.req.raw, c.res, ps, st, sp)
        return c
      }
      const rec: FRec = {
        method: meth,
        path: path,
        canonical: pattern.canonical,
        pattern: pattern,
        handler: h,
        wrapper: wrapper,
        store: st,
        version: version,
        host: host,
        order: this.counter,
      }
      this.counter += 1
      this.routes.push(rec)
      const cons = version === null && host === null ? null : { regex: null, host: host, version: version }
      this.core.add(meth, pattern.corePath, wrapper, [], cons)
    }
    return this
  }

  register(def: FmwRouteDef | FmwRouteDef[]): FmwRouter {
    const defs: FmwRouteDef[] = []
    if (Array.isArray(def)) {
      for (let i = 0; i < def.length; i++) defs.push(def[i])
    } else {
      defs.push(def)
    }
    for (let i = 0; i < defs.length; i++) {
      const d = defs[i]
      if (d === undefined) continue
      let path = ''
      if ('path' in d && d.path !== null && d.path !== undefined && d.path !== '') {
        path = d.path
      } else if ('url' in d && d.url !== null && d.url !== undefined) {
        path = d.url
      }
      const opts: FmwOnOpts = { version: null, host: null, constraints: null }
      if ('version' in d && d.version !== null && d.version !== undefined) opts.version = d.version
      if ('host' in d && d.host !== null && d.host !== undefined) opts.host = d.host
      if ('constraints' in d && d.constraints !== null && d.constraints !== undefined) opts.constraints = d.constraints
      if ('opts' in d && d.opts !== null && d.opts !== undefined) {
        const o = d.opts
        if ('version' in o && o.version !== null && o.version !== undefined) opts.version = o.version
        if ('host' in o && o.host !== null && o.host !== undefined) opts.host = o.host
        if ('constraints' in o && o.constraints !== null && o.constraints !== undefined) opts.constraints = o.constraints
      }
      if (!('handler' in d) || d.handler === null) throw new Error('register: missing handler')
      const st: FmwStore = 'store' in d && d.store !== null && d.store !== undefined ? d.store : null
      this.on(d.method, path, opts, d.handler, st)
    }
    return this
  }

  off(method: string | string[], path: string, opts?: FmwOnOpts | null): FmwRouter {
    const canon = this._norm(path)
    const pattern = parsePattern(canon, false).canonical
    const methods: string[] = typeof method === 'string' ? [method] : method
    let wantVersion: string | null = null
    let wantHost: string | null = null
    let filterCons = false
    if (opts !== undefined && opts !== null) {
      filterCons = true
      if ('version' in opts && opts.version !== null && opts.version !== undefined) wantVersion = String(opts.version)
      if ('host' in opts && opts.host !== null && opts.host !== undefined) wantHost = String(opts.host)
      if ('constraints' in opts && opts.constraints !== null && opts.constraints !== undefined) {
        const c = opts.constraints
        if ('version' in c && c.version !== null && c.version !== undefined) wantVersion = String(c.version)
        if ('host' in c && c.host !== null && c.host !== undefined) wantHost = String(c.host)
      }
    }
    let removed = 0
    const keep: FRec[] = []
    for (let i = 0; i < this.routes.length; i++) {
      const rec = this.routes[i]
      let hit = false
      for (let m = 0; m < methods.length; m++) {
        if (rec.method === methods[m].toUpperCase() && rec.canonical === pattern) hit = true
      }
      if (hit && filterCons && (rec.version !== wantVersion || rec.host !== wantHost)) hit = false
      if (hit) {
        removed += 1
      } else {
        keep.push(rec)
      }
    }
    if (removed === 0) throw new Error("Method '" + methods.join(',') + "' is not declared for path '" + path + "'")
    this.routes = keep
    return this
  }

  find(method: string, path: string, derived?: FmwConstraints | null): FmwFindResult | null {
    const q = splitQuery(path)
    const norm = this._norm(this._decode(q.path))
    let wantVersion: string | null = null
    let wantHost: string | null = null
    if (derived !== undefined && derived !== null) {
      if ('version' in derived && derived.version !== null && derived.version !== undefined) wantVersion = String(derived.version)
      if ('host' in derived && derived.host !== null && derived.host !== undefined) wantHost = String(derived.host)
    }
    // fast path: the core trie answers directly when nothing constrained is involved
    const m = this.core.find(method.toUpperCase(), norm)
    if (m !== null) {
      const rec = this._recOf(m.entry.handler)
      if (rec !== null && rec.version === null && rec.host === null && wantVersion === null && wantHost === null && this._paramsOk(m.params)) {
        return this._result(rec, m.params, q.search)
      }
    }
    return this._scan(method.toUpperCase(), norm, wantVersion, wantHost, q.search)
  }

  lookup(req: IncomingMessage, res: ServerResponse): void {
    const rawUrl = req.url === undefined ? '/' : req.url
    const method = req.method === undefined ? 'GET' : req.method
    const hdrs = req.headers
    const hkeys = Object.keys(hdrs)
    let wantVersion: string | null = null
    if (hkeys.indexOf('accept-version') >= 0) {
      const av = hdrs['accept-version']
      if (typeof av === 'string') {
        wantVersion = av
      } else if (av !== undefined) {
        wantVersion = String(av)
      }
    }
    let wantHost: string | null = null
    if (hkeys.indexOf('host') >= 0) {
      const hh = hdrs['host']
      if (typeof hh === 'string') {
        wantHost = hh
      } else if (hh !== undefined) {
        wantHost = String(hh)
      }
    }
    const found = this.find(method, rawUrl, { version: wantVersion, host: wantHost })
    if (found !== null) {
      found.handler(req, res, found.params, found.store, found.searchParams)
      return
    }
    const path = this._norm(this._decode(splitQuery(rawUrl).path))
    const allowed = this.allowedMethods(path)
    if (allowed.length > 0) {
      res.statusCode = 405
      res.setHeader('allow', allowed.join(', '))
      res.end()
      return
    }
    if (this.defaultRoute !== null) {
      this.defaultRoute(req, res, {}, null, {})
      return
    }
    res.statusCode = 404
    res.end()
  }

  allowedMethods(path: string): string[] {
    const norm = this._norm(this._decode(splitQuery(path).path))
    const pathSegs: string[] = []
    const rawSegs = norm.split('/')
    for (let i = 0; i < rawSegs.length; i++) {
      if (rawSegs[i] !== '') pathSegs.push(rawSegs[i])
    }
    const out: string[] = []
    for (let i = 0; i < this.routes.length; i++) {
      const rec = this.routes[i]
      if (out.indexOf(rec.method) >= 0) continue
      let hit = false
      for (let v = 0; v < rec.pattern.variants.length; v++) {
        if (matchVariant(rec.pattern.variants[v], pathSegs) !== null) {
          hit = true
          break
        }
      }
      if (hit) out.push(rec.method)
    }
    return out
  }

  all(): FmwRouteInfo[] {
    const out: FmwRouteInfo[] = []
    for (let i = 0; i < this.routes.length; i++) {
      const rec = this.routes[i]
      out.push({ method: rec.method, path: rec.path, handler: rec.handler, store: rec.store, version: rec.version, host: rec.host })
    }
    return out
  }

  prettyPrint(): string {
    interface PP {
      kids: { [k: string]: PP }
      order: string[]
      leaf: string[]
    }
    const root: PP = { kids: {}, order: [], leaf: [] }
    for (let i = 0; i < this.routes.length; i++) {
      const rec = this.routes[i]
      for (let v = 0; v < rec.pattern.variants.length; v++) {
        const segs = rec.pattern.variants[v]
        let node = root
        for (let s = 0; s < segs.length; s++) {
          const label = segs[s].kind === SEG_STATIC ? segs[s].name : segs[s].kind === SEG_PARAM ? ':' + segs[s].name : '*'
          if (Object.keys(node.kids).indexOf(label) < 0) {
            node.kids[label] = { kids: {}, order: [], leaf: [] }
            node.order.push(label)
          }
          node = node.kids[label]
        }
        const tag = rec.method + (rec.version === null ? '' : '@' + rec.version) + (rec.host === null ? '' : ' ' + rec.host)
        if (node.leaf.indexOf(tag) < 0) node.leaf.push(tag)
      }
    }
    const lines: string[] = []
    // iterative DFS (no recursion): stack of {node, prefix, seg}
    interface Frame {
      node: PP
      prefix: string
      seg: string
    }
    const stack: Frame[] = [{ node: root, prefix: '', seg: '/' }]
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]
      stack.pop()
      const node = frame.node
      const tag = node.leaf.length > 0 ? ' (' + node.leaf.join(', ') + ')' : ''
      lines.push(frame.prefix + frame.seg + tag)
      for (let i = node.order.length - 1; i >= 0; i--) {
        const label = node.order[i]
        stack.push({ node: node.kids[label], prefix: frame.prefix + '  ', seg: label })
      }
    }
    return lines.join('\n')
  }
}

export function FindMyWay(opts?: FmwOptions | null): FmwRouter {
  return new FmwRouter(opts === undefined ? null : opts)
}

export default FindMyWay
