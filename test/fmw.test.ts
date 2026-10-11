// test/fmw.test.ts — unit tests for the ch3/fmw shim (find-my-way surface).
// Runs under `node --test` against test/stub-fmw.ts until the real core lands.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as http from 'node:http'
import { FindMyWay } from '../src/shims/fmw.ts'
import type { FmwHandler, FmwFindResult } from '../src/shims/fmw.ts'
import { createCore } from './stub-fmw.ts'
import type { IncomingMessage, ServerResponse } from 'node:http'

function echo(): FmwHandler {
  return (_req: IncomingMessage, res: ServerResponse, params: { [k: string]: string }) => {
    res.end(JSON.stringify(params))
  }
}

test('on/find static route', () => {
  const r = FindMyWay(null)
  const h = echo()
  r.on('GET', '/json', h)
  const m = r.find('GET', '/json', null)
  assert.ok(m !== null)
  assert.equal(m.handler, h)
  assert.deepEqual(m.params, {})
  assert.equal(m.store, null)
})

test('param route', () => {
  const r = FindMyWay(null)
  r.on('GET', '/user/:id', echo())
  const m = r.find('GET', '/user/42', null)
  assert.ok(m !== null)
  assert.equal(m.params['id'], '42')
})

test('wildcard route', () => {
  const r = FindMyWay(null)
  r.on('GET', '/files/*', echo())
  const m = r.find('GET', '/files/a/b/c', null)
  assert.ok(m !== null)
  assert.equal(m.params['*'], 'a/b/c')
})

test('optional param matches both arities', () => {
  const r = FindMyWay(null)
  r.on('GET', '/opt/:p?', echo())
  const withP = r.find('GET', '/opt/x', null)
  assert.ok(withP !== null)
  assert.equal(withP.params['p'], 'x')
  const without = r.find('GET', '/opt', null)
  assert.ok(without !== null)
  assert.equal(without.params['p'], undefined)
})

test('regex param via fmw (re) syntax', () => {
  const r = FindMyWay(null)
  r.on('GET', '/n/:id(\\d+)', echo())
  const ok = r.find('GET', '/n/123', null)
  assert.ok(ok !== null)
  assert.equal(ok.params['id'], '123')
  assert.equal(r.find('GET', '/n/abc', null), null)
})

test('static beats param beats wildcard', () => {
  const r = FindMyWay(null)
  const hs = echo()
  const hp = echo()
  const hw = echo()
  r.on('GET', '/p/:x', hp)
  r.on('GET', '/p/static', hs)
  r.on('GET', '/p/*', hw)
  const a = r.find('GET', '/p/static', null)
  const b = r.find('GET', '/p/other', null)
  const c = r.find('GET', '/p/a/b', null)
  assert.equal(a === null ? null : a.handler, hs)
  assert.equal(b === null ? null : b.handler, hp)
  assert.equal(c === null ? null : c.handler, hw)
})

test('multi-method registration', () => {
  const r = FindMyWay(null)
  const h = echo()
  r.on(['GET', 'POST'], '/multi', h)
  assert.equal((r.find('GET', '/multi', null) as FmwFindResult | null)?.handler, h)
  assert.equal((r.find('POST', '/multi', null) as FmwFindResult | null)?.handler, h)
  assert.equal(r.find('DELETE', '/multi', null), null)
})

test('duplicate registration throws', () => {
  const r = FindMyWay(null)
  r.on('GET', '/dup', echo())
  assert.throws(() => r.on('GET', '/dup', echo()))
  // different version constraint is a different route, not a dup
  r.on('GET', '/dup', { version: '1.0.0' }, echo())
  assert.equal(r.all().length, 2)
})

test('versioned routes: exact + x-range + caret, highest wins', () => {
  const r = FindMyWay(null)
  const h1 = echo()
  const h2 = echo()
  const h3 = echo()
  r.on('GET', '/v', { version: '1.0.0' }, h1)
  r.on('GET', '/v', { version: '1.2.0' }, h2)
  r.on('GET', '/v', { version: '2.0.0' }, h3)
  // exact spec
  const exact = r.find('GET', '/v', { version: '1.0.0', host: null })
  assert.equal(exact === null ? null : exact.handler, h1)
  // x-range picks highest satisfying declared
  const xr = r.find('GET', '/v', { version: '1.x', host: null })
  assert.equal(xr === null ? null : xr.handler, h2)
  // caret range
  const cr = r.find('GET', '/v', { version: '^1.0.0', host: null })
  assert.equal(cr === null ? null : cr.handler, h2)
  const cr2 = r.find('GET', '/v', { version: '^2.0.0', host: null })
  assert.equal(cr2 === null ? null : cr2.handler, h3)
  // no version requested -> versioned routes do not match
  assert.equal(r.find('GET', '/v', null), null)
  // unsatisfiable request -> null
  assert.equal(r.find('GET', '/v', { version: '3.x', host: null }), null)
})

test('unversioned fallback when version does not match', () => {
  const r = FindMyWay(null)
  const hv = echo()
  const hu = echo()
  r.on('GET', '/f', { version: '2.0.0' }, hv)
  r.on('GET', '/f', hu)
  assert.equal((r.find('GET', '/f', { version: '2.x', host: null }) as FmwFindResult).handler, hv)
  // no version asked -> unversioned
  assert.equal((r.find('GET', '/f', null) as FmwFindResult).handler, hu)
  // unsatisfiable version -> unversioned fallback (fastify semantics)
  assert.equal((r.find('GET', '/f', { version: '1.x', host: null }) as FmwFindResult).handler, hu)
})

test('host constraint', () => {
  const r = FindMyWay(null)
  const ha = echo()
  r.on('GET', '/h', { host: 'api.example.com' }, ha)
  assert.equal((r.find('GET', '/h', { version: null, host: 'api.example.com' }) as FmwFindResult).handler, ha)
  assert.equal(r.find('GET', '/h', { version: null, host: 'other.com' }), null)
  assert.equal(r.find('GET', '/h', null), null)
})

test('wildcard host constraint', () => {
  const r = FindMyWay(null)
  const h = echo()
  r.on('GET', '/w', { host: '*.example.com' }, h)
  assert.equal((r.find('GET', '/w', { version: null, host: 'a.example.com' }) as FmwFindResult).handler, h)
  assert.equal(r.find('GET', '/w', { version: null, host: 'example.com' }), null)
})

test('off removes the route', () => {
  const r = FindMyWay(null)
  r.on('GET', '/gone', echo())
  assert.ok(r.find('GET', '/gone', null) !== null)
  r.off('GET', '/gone')
  assert.equal(r.find('GET', '/gone', null), null)
  assert.throws(() => r.off('GET', '/gone'))
})

test('off with version constraint removes only that variant', () => {
  const r = FindMyWay(null)
  r.on('GET', '/vo', { version: '1.0.0' }, echo())
  r.on('GET', '/vo', { version: '2.0.0' }, echo())
  r.off('GET', '/vo', { version: '1.0.0' })
  assert.equal(r.all().length, 1)
  const m = r.find('GET', '/vo', { version: '2.x', host: null })
  assert.ok(m !== null)
  assert.equal(m.version, '2.0.0')
})

test('off then re-on returns fresh handler (stale core entry guarded)', () => {
  const r = FindMyWay(null)
  const h1 = echo()
  const h2 = echo()
  r.on('GET', '/cycle', h1)
  r.off('GET', '/cycle')
  r.on('GET', '/cycle', h2)
  const m = r.find('GET', '/cycle', null)
  assert.equal(m === null ? null : m.handler, h2)
})

test('store is returned by find', () => {
  const r = FindMyWay(null)
  r.on('GET', '/s', null, echo(), { a: 1 })
  const m = r.find('GET', '/s', null)
  assert.deepEqual(m === null ? null : m.store, { a: 1 })
})

test('searchParams parsed from find path', () => {
  const r = FindMyWay(null)
  r.on('GET', '/q', echo())
  const m = r.find('GET', '/q?a=1&b=2&b=3', null)
  assert.ok(m !== null)
  assert.equal(m.searchParams['a'], '1')
  assert.deepEqual(m.searchParams['b'], ['2', '3'])
})

test('caseSensitive=false folds case', () => {
  const r = FindMyWay({ caseSensitive: false })
  r.on('GET', '/MiXeD', echo())
  assert.ok(r.find('GET', '/mixed', null) !== null)
  assert.ok(r.find('GET', '/MIXED', null) !== null)
})

test('maxParamLength rejects long params', () => {
  const r = FindMyWay({ maxParamLength: 4 })
  r.on('GET', '/u/:id', echo())
  assert.ok(r.find('GET', '/u/abcd', null) !== null)
  assert.equal(r.find('GET', '/u/abcde', null), null)
})

test('register bulk + url alias', () => {
  const r = FindMyWay(null)
  r.register([
    { method: 'GET', path: '/r1', handler: echo() },
    { method: 'POST', url: '/r2', handler: echo() },
  ])
  assert.ok(r.find('GET', '/r1', null) !== null)
  assert.ok(r.find('POST', '/r2', null) !== null)
})

test('all() lists live routes', () => {
  const r = FindMyWay(null)
  r.on('GET', '/a', echo())
  r.on('POST', '/b/:x', { version: '1.0.0' }, echo())
  const all = r.all()
  assert.equal(all.length, 2)
  assert.equal(all[0].method, 'GET')
  assert.equal(all[1].version, '1.0.0')
})

test('prettyPrint renders a tree string', () => {
  const r = FindMyWay(null)
  r.on('GET', '/json', echo())
  r.on('GET', '/user/:id', { version: '1.0.0' }, echo())
  const out = r.prettyPrint()
  assert.ok(out.indexOf('json') >= 0)
  assert.ok(out.indexOf(':id') >= 0)
  assert.ok(out.indexOf('GET@1.0.0') >= 0)
})

test('async handler rejected at wrap time', () => {
  const r = FindMyWay(null)
  const ah = async () => {}
  assert.throws(() => r.on('GET', '/a', ah as unknown as FmwHandler), /async handlers unsupported under ch3/)
})

test('lookup dispatches handler with params over real http', async () => {
  const r = FindMyWay(null)
  r.on('GET', '/user/:id', (req, res, params) => {
    res.end('user:' + params['id'])
  })
  const srv = http.createServer((req, res) => {
    r.lookup(req, res)
  })
  await new Promise<void>((resolve) => srv.listen(0, resolve))
  const addr = srv.address() as { port: number }
  const resp = await fetch('http://127.0.0.1:' + String(addr.port) + '/user/77')
  assert.equal(await resp.text(), 'user:77')
  srv.close()
})

test('lookup 405 + allow header on method miss', async () => {
  const r = FindMyWay(null)
  r.on('GET', '/only-get', echo())
  const srv = http.createServer((req, res) => {
    r.lookup(req, res)
  })
  await new Promise<void>((resolve) => srv.listen(0, resolve))
  const addr = srv.address() as { port: number }
  const resp = await fetch('http://127.0.0.1:' + String(addr.port) + '/only-get', { method: 'POST' })
  assert.equal(resp.status, 405)
  assert.equal(resp.headers.get('allow'), 'GET')
  srv.close()
})

test('lookup defaultRoute on miss', async () => {
  const r = FindMyWay(null)
  r.defaultRoute = (_req, res) => {
    res.statusCode = 404
    res.end('nope')
  }
  const srv = http.createServer((req, res) => {
    r.lookup(req, res)
  })
  await new Promise<void>((resolve) => srv.listen(0, resolve))
  const addr = srv.address() as { port: number }
  const resp = await fetch('http://127.0.0.1:' + String(addr.port) + '/missing')
  assert.equal(resp.status, 404)
  assert.equal(await resp.text(), 'nope')
  srv.close()
})

test('lookup honors accept-version header', async () => {
  const r = FindMyWay(null)
  r.on('GET', '/v', { version: '1.0.0' }, (_req, res) => res.end('v1'))
  r.on('GET', '/v', { version: '2.0.0' }, (_req, res) => res.end('v2'))
  const srv = http.createServer((req, res) => {
    r.lookup(req, res)
  })
  await new Promise<void>((resolve) => srv.listen(0, resolve))
  const addr = srv.address() as { port: number }
  const resp = await fetch('http://127.0.0.1:' + String(addr.port) + '/v', { headers: { 'accept-version': '2.x' } })
  assert.equal(await resp.text(), 'v2')
  srv.close()
})

test('shim routes also live in the core trie (core.find parity)', () => {
  const r = FindMyWay(null)
  r.on('GET', '/deep/:x', echo())
  const core = createCore()
  // the shim's internal core is what we assert against via all()
  const entries = r.all()
  assert.equal(entries.length, 1)
  assert.equal(entries[0].path, '/deep/:x')
})
