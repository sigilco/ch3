// ch3/h3 shim tests — h3-shaped cases under node:test, against the real
// core (src/index.ts). Spins each app on an ephemeral port.

import * as assert from 'node:assert'
import * as http from 'node:http'
import test from 'node:test'
import {
  H3Error,
  assertMethod,
  createApp,
  createError,
  createRouter,
  defineEventHandler,
  eventHandler,
  getCookie,
  getQuery,
  getRequestHeader,
  getRequestQuery,
  getResponseHeader,
  getRouterParam,
  isError,
  parseCookies,
  readBody,
  readRawBody,
  send,
  sendError,
  sendNoContent,
  sendRedirect,
  setCookie,
  setResponseHeader,
  setResponseStatus,
  toNodeListener,
} from '../src/shims/h3.ts'
import type { H3App } from '../src/shims/h3.ts'

async function listen(app: H3App): Promise<{ base: string; close: () => void }> {
  const srv = http.createServer(toNodeListener(app))
  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', () => resolve()))
  const addr = srv.address() as { port: number }
  return {
    base: 'http://127.0.0.1:' + String(addr.port),
    close: () => srv.close(),
  }
}

test('router mounted via app.use(router) — text return marshals', async () => {
  const app = createApp()
  const router = createRouter()
  router.get('/hello', defineEventHandler(() => 'world'))
  app.use(router)
  const { base, close } = await listen(app)
  const res = await fetch(base + '/hello')
  assert.strictEqual(res.status, 200)
  assert.strictEqual(await res.text(), 'world')
  close()
})

test('object return marshals to JSON response', async () => {
  const app = createApp()
  const router = createRouter()
  router.get('/json', defineEventHandler(() => ({ hello: 'world' })))
  app.use(router)
  const { base, close } = await listen(app)
  const res = await fetch(base + '/json')
  assert.deepStrictEqual(await res.json(), { hello: 'world' })
  close()
})

test('getRouterParam on /user/:id', async () => {
  const app = createApp()
  const router = createRouter()
  router.get('/user/:id', defineEventHandler((e) => ({ id: getRouterParam(e, 'id') })))
  app.use(router)
  const { base, close } = await listen(app)
  const res = await fetch(base + '/user/42')
  assert.deepStrictEqual(await res.json(), { id: '42' })
  close()
})

test('wildcard splat param via getRouterParam(*)', async () => {
  const app = createApp()
  const router = createRouter()
  router.get('/files/*', defineEventHandler((e) => getRouterParam(e, '*')))
  app.use(router)
  const { base, close } = await listen(app)
  const res = await fetch(base + '/files/a/b/c.txt')
  assert.strictEqual(await res.text(), 'a/b/c.txt')
  close()
})

test('getQuery/getRequestQuery — last-wins map', async () => {
  const app = createApp()
  const router = createRouter()
  router.get('/q', defineEventHandler((e) => getQuery(e)))
  router.get('/q2', defineEventHandler((e) => getRequestQuery(e)))
  app.use(router)
  const { base, close } = await listen(app)
  const res = await fetch(base + '/q?a=1&a=2&b=x')
  assert.deepStrictEqual(await res.json(), { a: '2', b: 'x' })
  const res2 = await fetch(base + '/q2?only=one')
  assert.deepStrictEqual(await res2.json(), { only: 'one' })
  close()
})

test('readRawBody echoes raw body; readBody parses JSON', async () => {
  const app = createApp()
  const router = createRouter()
  router.post('/echo', defineEventHandler((e) => readRawBody(e)))
  router.post('/obj', defineEventHandler((e) => readBody(e)))
  app.use(router)
  const { base, close } = await listen(app)
  const res = await fetch(base + '/echo', { method: 'POST', body: 'ping-123' })
  assert.strictEqual(await res.text(), 'ping-123')
  const res2 = await fetch(base + '/obj', {
    method: 'POST',
    body: JSON.stringify({ n: 7 }),
    headers: { 'content-type': 'application/json' },
  })
  assert.deepStrictEqual(await res2.json(), { n: 7 })
  close()
})

test('readBody: JSON ct parses; non-JSON returns raw; bad JSON → 400', async () => {
  const app = createApp()
  const router = createRouter()
  router.post('/obj', defineEventHandler((e) => readBody(e)))
  app.use(router)
  const { base, close } = await listen(app)
  // text body → raw string
  const r1 = await fetch(base + '/obj', { method: 'POST', body: 'not json' })
  assert.strictEqual(r1.status, 200)
  assert.strictEqual(await r1.text(), 'not json')
  // json content-type → parsed
  const r2 = await fetch(base + '/obj', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"n":7}' })
  assert.strictEqual(r2.status, 200)
  const parsed = await r2.json()
  assert.strictEqual(parsed.n, 7)
  // json content-type + malformed → 400
  const r3 = await fetch(base + '/obj', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not json' })
  assert.strictEqual(r3.status, 400)
  const body = await r3.json()
  assert.strictEqual(body.statusCode, 400)
  close()
})

test('setResponseStatus + setResponseHeader/getResponseHeader', async () => {
  const app = createApp()
  const router = createRouter()
  router.get('/s', defineEventHandler((e) => {
    setResponseStatus(e, 201)
    setResponseHeader(e, 'x-made-by', 'h3-shim')
    return { ok: getResponseHeader(e, 'x-made-by') === 'h3-shim' }
  }))
  app.use(router)
  const { base, close } = await listen(app)
  const res = await fetch(base + '/s')
  assert.strictEqual(res.status, 201)
  assert.strictEqual(res.headers.get('x-made-by'), 'h3-shim')
  assert.deepStrictEqual(await res.json(), { ok: true })
  close()
})

test('throw createError → statusCode honored + JSON error body', async () => {
  const app = createApp()
  const router = createRouter()
  router.get('/teapot', defineEventHandler(() => {
    throw createError({ statusCode: 418, statusMessage: 'teapot', message: 'short and stout' })
  }))
  app.use(router)
  const { base, close } = await listen(app)
  const res = await fetch(base + '/teapot')
  assert.strictEqual(res.status, 418)
  const body = await res.json()
  assert.strictEqual(body.statusCode, 418)
  assert.strictEqual(body.statusMessage, 'teapot')
  assert.strictEqual(body.message, 'short and stout')
  close()
})

test('sendError writes JSON error response', async () => {
  const app = createApp()
  const router = createRouter()
  router.get('/e', defineEventHandler((e) => {
    sendError(e, createError({ statusCode: 403, statusMessage: 'forbidden' }))
  }))
  app.use(router)
  const { base, close } = await listen(app)
  const res = await fetch(base + '/e')
  assert.strictEqual(res.status, 403)
  const body = await res.json()
  assert.strictEqual(body.statusCode, 403)
  close()
})

test('createError variants + isError', () => {
  const a = createError('oops')
  assert.strictEqual(a.message, 'oops')
  assert.strictEqual(a.statusCode, 500)
  const b = createError(404)
  assert.strictEqual(b.statusCode, 404)
  const c = createError({ statusCode: 400, data: { k: 'v' } })
  assert.strictEqual(c.statusCode, 400)
  assert.deepStrictEqual(c.data, { k: 'v' })
  assert.ok(isError(a))
  assert.ok(a instanceof H3Error)
  assert.ok(!isError(new Error('x')))
  assert.strictEqual(createError(a), a)
})

test('app.use global middleware runs for all paths; path-scoped only under prefix', async () => {
  const app = createApp()
  const hits: string[] = []
  app.use(defineEventHandler((e) => {
    hits.push('global:' + e.path)
    // undefined return → continue
  }))
  app.use('/api', defineEventHandler((e) => {
    hits.push('api:' + e.path)
    e.context['scoped'] = true
  }))
  const router = createRouter()
  router.get('/api/x', defineEventHandler(() => 'x'))
  router.get('/other/y', defineEventHandler(() => 'y'))
  app.use(router)
  const { base, close } = await listen(app)
  const res1 = await fetch(base + '/api/x')
  assert.strictEqual(await res1.text(), 'x')
  const res2 = await fetch(base + '/other/y')
  assert.strictEqual(await res2.text(), 'y')
  assert.deepStrictEqual(hits, ['global:/api/x', 'api:/api/x', 'global:/other/y'])
  close()
})

test('app.use middleware that returns a value answers the request', async () => {
  const app = createApp()
  app.use('/early', defineEventHandler(() => ({ short: 'circuit' })))
  const router = createRouter()
  router.get('/early', defineEventHandler(() => 'route-handler'))
  app.use(router)
  const { base, close } = await listen(app)
  const res = await fetch(base + '/early')
  assert.deepStrictEqual(await res.json(), { short: 'circuit' })
  close()
})

test('event.context bag shared middleware → route handler', async () => {
  const app = createApp()
  app.use(defineEventHandler((e) => {
    e.context['who'] = 'middleware'
  }))
  const router = createRouter()
  router.get('/ctx', defineEventHandler((e) => ({ who: e.context['who'] })))
  app.use(router)
  const { base, close } = await listen(app)
  const res = await fetch(base + '/ctx')
  assert.deepStrictEqual(await res.json(), { who: 'middleware' })
  close()
})

test('event.node.req/res are the raw node handles', async () => {
  const app = createApp()
  const router = createRouter()
  router.get('/node', defineEventHandler((e) => {
    const ua = e.node.req.headers['user-agent'] || ''
    e.node.res.setHeader('x-via-node', '1')
    return { ua: ua.length > 0, isReq: e.node.req instanceof http.IncomingMessage }
  }))
  app.use(router)
  const { base, close } = await listen(app)
  const res = await fetch(base + '/node', { headers: { 'user-agent': 'test-agent' } })
  assert.strictEqual(res.headers.get('x-via-node'), '1')
  assert.deepStrictEqual(await res.json(), { ua: true, isReq: true })
  close()
})

test('routes added after app.use(router) propagate (live mount)', async () => {
  const app = createApp()
  const router = createRouter()
  app.use(router)
  router.get('/late', defineEventHandler(() => 'late-route'))
  const { base, close } = await listen(app)
  const res = await fetch(base + '/late')
  assert.strictEqual(await res.text(), 'late-route')
  close()
})

test('app.use(prefix, router) mounts under prefix', async () => {
  const app = createApp()
  const router = createRouter()
  router.get('/health', defineEventHandler(() => ({ ok: true })))
  app.use('/api', router)
  const { base, close } = await listen(app)
  const res = await fetch(base + '/api/health')
  assert.deepStrictEqual(await res.json(), { ok: true })
  close()
})

test('async handlers rejected at wrap time', () => {
  assert.throws(
    () => defineEventHandler(async () => 'x'),
    /async handlers unsupported under ch3/
  )
  assert.throws(
    () => createRouter().get('/x', async () => 'x'),
    /async handlers unsupported under ch3/
  )
  const app = createApp()
  assert.throws(
    () => app.use(async () => 'x'),
    /async handlers unsupported under ch3/
  )
})

test('send() variants: string / object / noContent / redirect', async () => {
  const app = createApp()
  const router = createRouter()
  router.get('/s1', defineEventHandler((e) => { send(e, 'plain') }))
  router.get('/s2', defineEventHandler((e) => { send(e, { a: 1 }) }))
  router.get('/s3', defineEventHandler((e) => { sendNoContent(e) }))
  router.get('/s4', defineEventHandler((e) => { sendRedirect(e, '/s1', 301) }))
  app.use(router)
  const { base, close } = await listen(app)
  const r1 = await fetch(base + '/s1')
  assert.strictEqual(await r1.text(), 'plain')
  const r2 = await fetch(base + '/s2')
  assert.deepStrictEqual(await r2.json(), { a: 1 })
  const r3 = await fetch(base + '/s3')
  assert.strictEqual(r3.status, 204)
  const r4 = await fetch(base + '/s4', { redirect: 'manual' })
  assert.strictEqual(r4.status, 301)
  assert.strictEqual(r4.headers.get('location'), '/s1')
  close()
})

test('getRequestHeader / getMethod-ish fields / assertMethod', async () => {
  const app = createApp()
  const router = createRouter()
  router.get('/m', defineEventHandler((e) => {
    assertMethod(e, 'GET')
    return { method: e.method, path: e.path, hdr: getRequestHeader(e, 'x-t') }
  }))
  router.use('/only-post', defineEventHandler((e) => {
    assertMethod(e, 'POST')
    return 'ok'
  }))
  app.use(router)
  const { base, close } = await listen(app)
  try {
    const res = await fetch(base + '/m', { headers: { 'x-t': '1' } })
    assert.deepStrictEqual(await res.json(), { method: 'GET', path: '/m', hdr: '1' })
    // '*' route matches any method; assertMethod throws H3Error(405)
    const res2 = await fetch(base + '/only-post', { method: 'DELETE' })
    assert.strictEqual(res2.status, 405)
    const res3 = await fetch(base + '/only-post', { method: 'POST' })
    assert.strictEqual(await res3.text(), 'ok')
  } finally {
    close()
  }
})

test('cookies: setCookie → set-cookie header; getCookie/parseCookies read', async () => {
  const app = createApp()
  const router = createRouter()
  router.get('/set', defineEventHandler((e) => {
    setCookie(e, 'session', 'abc 123', { path: '/', httpOnly: true, maxAge: 60 })
    return 'set'
  }))
  router.get('/get', defineEventHandler((e) => ({ v: getCookie(e, 'session'), all: parseCookies(e) })))
  app.use(router)
  const { base, close } = await listen(app)
  const res = await fetch(base + '/set')
  const sc = res.headers.get('set-cookie') || ''
  assert.ok(sc.indexOf('session=abc%20123') === 0)
  assert.ok(sc.indexOf('HttpOnly') > 0)
  const res2 = await fetch(base + '/get', { headers: { cookie: 'session=xyz; other=1' } })
  assert.deepStrictEqual(await res2.json(), { v: 'xyz', all: { session: 'xyz', other: '1' } })
  close()
})

test('unmatched route → 404; use middleware still runs', async () => {
  const app = createApp()
  const hits: string[] = []
  app.use(defineEventHandler((e) => { hits.push(e.path) }))
  const { base, close } = await listen(app)
  const res = await fetch(base + '/missing')
  assert.strictEqual(res.status, 404)
  assert.deepStrictEqual(hits, ['/missing'])
  close()
})

test('eventHandler alias + getRequestQuery oddities', () => {
  const h = () => 'x'
  assert.strictEqual(eventHandler(h), h)
  assert.strictEqual(defineEventHandler(h), h)
})
