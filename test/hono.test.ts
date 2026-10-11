// ch3/hono shim tests — route-file-shaped cases under node:test.
// Runs against test/stub-hono.ts via src/index.ts (run-hono.sh copies the
// stub there when the real core hasn't landed).

import * as assert from 'node:assert'
import test from 'node:test'
import { Hono } from '../src/shims/hono.ts'

// Spin an app on an ephemeral port; returns {base, close}.
async function listen(app: Hono): Promise<{ base: string; close: () => void }> {
  const srv = app.serve({ port: 0, hostname: null, maxBodyBytes: null })
  await new Promise<void>((resolve) => srv.on('listening', () => resolve()))
  const addr = srv.address() as { port: number }
  return {
    base: 'http://127.0.0.1:' + String(addr.port),
    close: () => srv.close(),
  }
}

test('GET /json — c.json body + content-type + 200', async () => {
  const app = new Hono()
  app.get('/json', (c) => c.json({ hello: 'world' }))
  const { base, close } = await listen(app)
  const res = await fetch(base + '/json')
  assert.strictEqual(res.status, 200)
  assert.strictEqual(res.headers.get('content-type'), 'application/json')
  assert.deepStrictEqual(await res.json(), { hello: 'world' })
  close()
})

test('GET /user/:id — c.req.param', async () => {
  const app = new Hono()
  app.get('/user/:id', (c) => c.json({ id: c.req.param('id') }))
  const { base, close } = await listen(app)
  const res = await fetch(base + '/user/42')
  assert.deepStrictEqual(await res.json(), { id: '42' })
  close()
})

test('GET /files/* — splat param', async () => {
  const app = new Hono()
  app.get('/files/*', (c) => c.text(c.req.param('*') || ''))
  const { base, close } = await listen(app)
  const res = await fetch(base + '/files/a/b/c.txt')
  assert.strictEqual(await res.text(), 'a/b/c.txt')
  close()
})

test('global use middleware — c.set/c.get + ordering', async () => {
  const app = new Hono()
  const order: string[] = []
  app.use((c, next) => {
    order.push('mw')
    c.set('who', 'middleware')
    c.header('x-powered-by', 'ch3')
    next()
  })
  app.get('/x', (c) => {
    order.push('handler')
    return c.text(String(c.get('who')))
  })
  const { base, close } = await listen(app)
  const res = await fetch(base + '/x')
  assert.strictEqual(await res.text(), 'middleware')
  assert.strictEqual(res.headers.get('x-powered-by'), 'ch3')
  assert.deepStrictEqual(order, ['mw', 'handler'])
  close()
})

test('path-scoped use middleware applies under prefix only', async () => {
  const app = new Hono()
  app.use('/api', (c, next) => {
    c.header('x-api', 'yes')
    next()
  })
  app.get('/api/thing', (c) => c.text('a'))
  app.get('/other', (c) => c.text('b'))
  const { base, close } = await listen(app)
  const r1 = await fetch(base + '/api/thing')
  assert.strictEqual(r1.headers.get('x-api'), 'yes')
  const r2 = await fetch(base + '/other')
  assert.strictEqual(r2.headers.get('x-api'), null)
  close()
})

test('route-level middleware chain via app.get(path, mw, handler)', async () => {
  const app = new Hono()
  const hits: string[] = []
  app.get(
    '/guarded',
    (c, next) => {
      hits.push('mw1')
      c.set('ok', true)
      next()
    },
    (c, next) => {
      hits.push('mw2')
      next()
    },
    (c) => {
      hits.push('handler')
      return c.text('in')
    },
  )
  const { base, close } = await listen(app)
  const res = await fetch(base + '/guarded')
  assert.strictEqual(await res.text(), 'in')
  assert.deepStrictEqual(hits, ['mw1', 'mw2', 'handler'])
  close()
})

test('notFound — custom 404 for unmatched route', async () => {
  const app = new Hono()
  app.get('/exists', (c) => c.text('y'))
  app.notFound((c) => c.status(404).json({ error: 'nope' }))
  const { base, close } = await listen(app)
  const res = await fetch(base + '/missing')
  assert.strictEqual(res.status, 404)
  assert.deepStrictEqual(await res.json(), { error: 'nope' })
  close()
})

test('onError — thrown handler error → custom 500', async () => {
  const app = new Hono()
  app.get('/boom', () => {
    throw new Error('kaboom')
  })
  app.onError((err, c) => c.status(500).json({ error: err.message }))
  const { base, close } = await listen(app)
  const res = await fetch(base + '/boom')
  assert.strictEqual(res.status, 500)
  assert.deepStrictEqual(await res.json(), { error: 'kaboom' })
  close()
})

test('app.route mounts a sub Hono app under a prefix', async () => {
  const sub = new Hono()
  sub.use((c, next) => {
    c.header('x-sub', '1')
    next()
  })
  sub.get('/health', (c) => c.json({ ok: true }))
  sub.get('/deep/:id', (c) => c.json({ id: c.req.param('id') }))
  const app = new Hono()
  app.route('/api', sub)
  const { base, close } = await listen(app)
  const r1 = await fetch(base + '/api/health')
  assert.deepStrictEqual(await r1.json(), { ok: true })
  assert.strictEqual(r1.headers.get('x-sub'), '1')
  const r2 = await fetch(base + '/api/deep/9')
  assert.deepStrictEqual(await r2.json(), { id: '9' })
  close()
})

test('c.text / c.html / c.redirect / c.status', async () => {
  const app = new Hono()
  app.get('/t', (c) => c.text('plain'))
  app.get('/h', (c) => c.html('<b>x</b>'))
  app.get('/r', (c) => c.redirect('/t'))
  app.get('/s', (c) => c.status(201).json({ made: true }))
  const { base, close } = await listen(app)
  const rt = await fetch(base + '/t')
  assert.strictEqual(rt.headers.get('content-type'), 'text/plain')
  assert.strictEqual(await rt.text(), 'plain')
  const rh = await fetch(base + '/h')
  assert.strictEqual(rh.headers.get('content-type'), 'text/html')
  const rr = await fetch(base + '/r', { redirect: 'manual' })
  assert.strictEqual(rr.status, 302)
  assert.strictEqual(rr.headers.get('location'), '/t')
  const rs = await fetch(base + '/s')
  assert.strictEqual(rs.status, 201)
  close()
})

test('POST c.req.parseBody — JSON body', async () => {
  const app = new Hono()
  app.post('/echo-json', (c) => {
    const body = c.req.parseBody() as { name: string }
    return c.json({ got: body.name })
  })
  const { base, close } = await listen(app)
  const res = await fetch(base + '/echo-json', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'ada' }),
  })
  assert.deepStrictEqual(await res.json(), { got: 'ada' })
  close()
})

test('c.req.query / queries / header', async () => {
  const app = new Hono()
  app.get('/q', (c) =>
    c.json({
      one: c.req.query('one'),
      many: c.req.queries('many'),
      ua: c.req.header('x-thing'),
    }),
  )
  const { base, close } = await listen(app)
  const res = await fetch(base + '/q?one=1&many=a&many=b', {
    headers: { 'x-thing': 'yes' },
  })
  assert.deepStrictEqual(await res.json(), { one: '1', many: ['a', 'b'], ua: 'yes' })
  close()
})

test('async handlers throw at wrap time', () => {
  const app = new Hono()
  assert.throws(() => {
    app.get('/a', async () => {})
  }, /async handlers unsupported under ch3/)
  assert.throws(() => {
    app.use(async () => {})
  }, /async handlers unsupported under ch3/)
})

test('handler returning a foreign object is JSON-serialized at the edge', async () => {
  const app = new Hono()
  app.get('/obj', () => ({ loose: 'object' }) as never)
  const { base, close } = await listen(app)
  const res = await fetch(base + '/obj')
  assert.strictEqual(res.headers.get('content-type'), 'application/json')
  assert.deepStrictEqual(await res.json(), { loose: 'object' })
  close()
})

test('auto-HEAD dispatches GET handler, empty body', async () => {
  const app = new Hono()
  app.get('/heady', (c) => c.text('body-content'))
  const { base, close } = await listen(app)
  const res = await fetch(base + '/heady', { method: 'HEAD' })
  assert.strictEqual(res.status, 200)
  assert.strictEqual(await res.text(), '')
  close()
})

test('405 with Allow header for path matched under another method', async () => {
  const app = new Hono()
  app.get('/onlyget', (c) => c.text('g'))
  const { base, close } = await listen(app)
  const res = await fetch(base + '/onlyget', { method: 'POST' })
  assert.strictEqual(res.status, 405)
  assert.strictEqual(res.headers.get('allow'), 'GET')
  close()
})

test('c.env passed through from Hono init', async () => {
  const app = new Hono({ env: { flavor: 'test' } })
  app.get('/env', (c) => c.json({ flavor: c.env['flavor'] }))
  const { base, close } = await listen(app)
  const res = await fetch(base + '/env')
  assert.deepStrictEqual(await res.json(), { flavor: 'test' })
  close()
})

test('app.on registers method/path pairs', async () => {
  const app = new Hono()
  app.on('PUT', '/oni', (c) => c.text('put'))
  app.on(['PATCH'], ['/a', '/b'], (c) => c.text('multi'))
  const { base, close } = await listen(app)
  const r1 = await fetch(base + '/oni', { method: 'PUT' })
  assert.strictEqual(await r1.text(), 'put')
  const r2 = await fetch(base + '/b', { method: 'PATCH' })
  assert.strictEqual(await r2.text(), 'multi')
  close()
})

test('app.fire() is a chainable no-op', () => {
  const app = new Hono()
  assert.strictEqual(app.fire(), app)
})

test('app.fetch throws with a clear message', () => {
  const app = new Hono()
  assert.throws(() => app.fetch(), /app\.fetch is not supported under ch3/)
})

test('default notFound → 404; default onError → 500', async () => {
  const app = new Hono()
  app.get('/x', (c) => c.text('ok'))
  app.get('/die', () => {
    throw new Error('dead')
  })
  const { base, close } = await listen(app)
  const r404 = await fetch(base + '/nowhere')
  assert.strictEqual(r404.status, 404)
  const r500 = await fetch(base + '/die')
  assert.strictEqual(r500.status, 500)
  close()
})
