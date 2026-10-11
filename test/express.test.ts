// ch3/express shim tests — route-file-shaped cases under node:test.
// Runs against test/stub-express.ts via src/index.ts (run-express.sh copies
// the stub there when the real core hasn't landed).

import * as assert from 'node:assert'
import test from 'node:test'
import express, {
  Router,
  errorHandler,
  json,
  urlencoded,
} from '../src/shims/express.ts'
import type { ExpressApp } from '../src/shims/express.ts'

// Spin an app on an ephemeral port; returns {base, close}.
async function listen(
  app: ExpressApp,
): Promise<{ base: string; close: () => void }> {
  const srv = app.listen(0)
  await new Promise<void>((resolve) => srv.on('listening', () => resolve()))
  const addr = srv.address() as { port: number }
  return {
    base: 'http://127.0.0.1:' + String(addr.port),
    close: () => srv.close(),
  }
}

test('GET route — res.json body + content-type + 200 + x-powered-by', async () => {
  const app = express()
  app.get('/json', (req, res) => {
    res.json({ hello: 'world' })
  })
  const { base, close } = await listen(app)
  const res = await fetch(base + '/json')
  assert.strictEqual(res.status, 200)
  assert.strictEqual(res.headers.get('content-type'), 'application/json')
  assert.strictEqual(res.headers.get('x-powered-by'), 'Express')
  assert.deepStrictEqual(await res.json(), { hello: 'world' })
  close()
})

test('req.params / req.query / req.get / req.path / req.method / req.app', async () => {
  const app = express()
  app.get('/user/:id', (req, res) => {
    res.json({
      id: req.params['id'],
      q: req.query['q'],
      ua: req.get('x-thing'),
      path: req.path,
      method: req.method,
      sameApp: req.app === app,
    })
  })
  const { base, close } = await listen(app)
  const res = await fetch(base + '/user/42?q=yes', {
    headers: { 'x-thing': 'abc' },
  })
  assert.deepStrictEqual(await res.json(), {
    id: '42',
    q: 'yes',
    ua: 'abc',
    path: '/user/42',
    method: 'GET',
    sameApp: true,
  })
  close()
})

test('middleware chain order — globals run before handler', async () => {
  const app = express()
  const order: string[] = []
  app.use((req, res, next) => {
    order.push('mw1')
    next()
  })
  app.use('/api', (req, res, next) => {
    order.push('mw2')
    next()
  })
  app.get('/api/thing', (req, res) => {
    order.push('handler')
    res.send('done')
  })
  const { base, close } = await listen(app)
  await fetch(base + '/api/thing')
  assert.deepStrictEqual(order, ['mw1', 'mw2', 'handler'])
  close()
})

test('path-scoped middleware does not run outside its prefix', async () => {
  const app = express()
  let hits = 0
  app.use('/api', (req, res, next) => {
    hits = hits + 1
    next()
  })
  app.get('/other', (req, res) => res.send('o'))
  const { base, close } = await listen(app)
  await fetch(base + '/other')
  assert.strictEqual(hits, 0)
  close()
})

test('route-level middleware chain app.get(path, mw, handler)', async () => {
  const app = express()
  const hits: string[] = []
  app.get(
    '/guarded',
    (req, res, next) => {
      hits.push('mw1')
      res.locals['ok'] = true
      next()
    },
    (req, res, next) => {
      hits.push('mw2')
      next()
    },
    (req, res) => {
      hits.push('handler')
      res.json({ ok: res.locals['ok'] })
    },
  )
  const { base, close } = await listen(app)
  const res = await fetch(base + '/guarded')
  assert.deepStrictEqual(await res.json(), { ok: true })
  assert.deepStrictEqual(hits, ['mw1', 'mw2', 'handler'])
  close()
})

test('thrown error → errorHandler middleware (4-arity)', async () => {
  const app = express()
  app.get('/boom', () => {
    throw new Error('kaboom')
  })
  app.use(
    errorHandler((err, req, res, next) => {
      res.status(500).json({ error: (err as Error).message })
    }),
  )
  const { base, close } = await listen(app)
  const res = await fetch(base + '/boom')
  assert.strictEqual(res.status, 500)
  assert.deepStrictEqual(await res.json(), { error: 'kaboom' })
  close()
})

test('next(err) → error mw; bare next() inside errmw chains to next error mw', async () => {
  const app = express()
  app.use((req, res, next) => {
    next(new Error('forced'))
  })
  app.use((req, res, next) => {
    res.set('x-after-err', 'ran')
    next()
  })
  app.use(
    errorHandler((err, req, res, next) => {
      res.set('x-errmw', 'first')
      next()
    }),
  )
  app.use(
    errorHandler((err, req, res, next) => {
      res.status(502).json({ handled: 'second' })
    }),
  )
  const { base, close } = await listen(app)
  const res = await fetch(base + '/anything')
  assert.strictEqual(res.status, 502)
  assert.strictEqual(res.headers.get('x-errmw'), 'first')
  assert.deepStrictEqual(await res.json(), { handled: 'second' })
  close()
})

test("next('route') inside error mw resumes normal middleware", async () => {
  const app = express()
  app.use((req, res, next) => {
    next(new Error('forced'))
  })
  app.use(
    errorHandler((err, req, res, next) => {
      next('route')
    }),
  )
  app.use((req, res, next) => {
    res.status(200).send('resumed-normal')
  })
  const { base, close } = await listen(app)
  const res = await fetch(base + '/anything')
  assert.strictEqual(res.status, 200)
  assert.strictEqual(await res.text(), 'resumed-normal')
  close()
})

test('unhandled thrown error → 500 when no error middleware registered', async () => {
  const app = express()
  app.get('/die', () => {
    throw new Error('dead')
  })
  const { base, close } = await listen(app)
  const res = await fetch(base + '/die')
  assert.strictEqual(res.status, 500)
  close()
})

test('route-level errorHandler inside app.get fns', async () => {
  const app = express()
  app.get(
    '/x',
    () => {
      throw new Error('route-err')
    },
    errorHandler((err, req, res, next) => {
      res.status(503).send('caught-in-route')
    }),
  )
  const { base, close } = await listen(app)
  const res = await fetch(base + '/x')
  assert.strictEqual(res.status, 503)
  assert.strictEqual(await res.text(), 'caught-in-route')
  close()
})

test('req.body is null without parser middleware; {} for non-JSON', async () => {
  const app = express()
  app.post('/nobody', (req, res) => {
    res.json({ body: req.body === null ? 'null' : 'set' })
  })
  const app2 = express()
  app2.use(json())
  app2.post('/text', (req, res) => {
    res.json({ body: req.body })
  })
  const { base, close } = await listen(app)
  const r1 = await fetch(base + '/nobody', {
    method: 'POST',
    body: '{"a":1}',
    headers: { 'content-type': 'application/json' },
  })
  assert.deepStrictEqual(await r1.json(), { body: 'null' })
  close()
  const l2 = await listen(app2)
  const r2 = await fetch(l2.base + '/text', {
    method: 'POST',
    body: 'plain text',
    headers: { 'content-type': 'text/plain' },
  })
  assert.deepStrictEqual(await r2.json(), { body: {} })
  l2.close()
})

test('express.json() parses JSON body onto req.body', async () => {
  const app = express()
  app.use(json())
  app.post('/echo', (req, res) => {
    const b = req.body as { name: string; tags: string[] }
    res.json({ got: b.name, n: b.tags.length })
  })
  const { base, close } = await listen(app)
  const res = await fetch(base + '/echo', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'ada', tags: ['x', 'y'] }),
  })
  assert.deepStrictEqual(await res.json(), { got: 'ada', n: 2 })
  close()
})

test('express.json() invalid JSON → error middleware sees HttpError 400', async () => {
  const app = express()
  app.use(json())
  app.post('/echo', (req, res) => res.json({ ok: true }))
  app.use(
    errorHandler((err, req, res, next) => {
      const he = err as { status: number; message: string }
      res.status(he.status).json({ error: he.message })
    }),
  )
  const { base, close } = await listen(app)
  const res = await fetch(base + '/echo', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{not json',
  })
  assert.strictEqual(res.status, 400)
  assert.deepStrictEqual(await res.json(), { error: 'invalid JSON body' })
  close()
})

test('express.urlencoded() parses form bodies', async () => {
  const app = express()
  app.use(urlencoded())
  app.post('/form', (req, res) => {
    const b = req.body as { user: string; tag: string }
    res.json({ user: b.user, tag: b.tag })
  })
  const { base, close } = await listen(app)
  const res = await fetch(base + '/form', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'user=ada+lovelace&tag=a%2Fb',
  })
  assert.deepStrictEqual(await res.json(), { user: 'ada lovelace', tag: 'a/b' })
  close()
})

test('Router() mount via app.use("/api", router) — routes + scoped mw', async () => {
  const r = Router()
  r.use((req, res, next) => {
    res.set('x-sub', '1')
    next()
  })
  r.get('/health', (req, res) => {
    res.json({ ok: true })
  })
  r.get('/deep/:id', (req, res) => {
    res.json({ id: req.params['id'] })
  })
  const app = express()
  app.use('/api', r)
  const { base, close } = await listen(app)
  const r1 = await fetch(base + '/api/health')
  assert.deepStrictEqual(await r1.json(), { ok: true })
  assert.strictEqual(r1.headers.get('x-sub'), '1')
  const r2 = await fetch(base + '/api/deep/9')
  assert.deepStrictEqual(await r2.json(), { id: '9' })
  close()
})

test('app.mount("/api", router) — the scriptc-safe mount spelling', async () => {
  const r = Router()
  r.get('/health', (req, res) => {
    res.json({ mounted: true })
  })
  const app = express()
  app.mount('/api', r)
  const { base, close } = await listen(app)
  const res = await fetch(base + '/api/health')
  assert.deepStrictEqual(await res.json(), { mounted: true })
  close()
})

test('mounted router mw does not leak outside the mount prefix', async () => {
  const r = Router()
  r.use((req, res, next) => {
    res.set('x-sub', '1')
    next()
  })
  const app = express()
  app.use('/api', r)
  app.get('/free', (req, res) => res.send('f'))
  const { base, close } = await listen(app)
  const res = await fetch(base + '/free')
  assert.strictEqual(res.headers.get('x-sub'), null)
  close()
})

test('app.route(path) builder chains methods', async () => {
  const app = express()
  app
    .route('/item')
    .get((req, res) => res.send('g'))
    .post((req, res) => res.send('p'))
    .delete((req, res) => res.send('d'))
  const { base, close } = await listen(app)
  const rg = await fetch(base + '/item')
  assert.strictEqual(await rg.text(), 'g')
  const rp = await fetch(base + '/item', { method: 'POST' })
  assert.strictEqual(await rp.text(), 'p')
  const rd = await fetch(base + '/item', { method: 'DELETE' })
  assert.strictEqual(await rd.text(), 'd')
  close()
})

test('res.send — string/object/Buffer/null variants', async () => {
  const app = express()
  app.get('/s', (req, res) => res.send('plain'))
  app.get('/o', (req, res) => res.send({ a: 1 }))
  app.get('/b', (req, res) => res.send(Buffer.from('rawbytes')))
  app.get('/n', (req, res) => res.send(null))
  const { base, close } = await listen(app)
  const rs = await fetch(base + '/s')
  assert.strictEqual(rs.headers.get('content-type'), 'text/plain')
  assert.strictEqual(await rs.text(), 'plain')
  const ro = await fetch(base + '/o')
  assert.strictEqual(ro.headers.get('content-type'), 'application/json')
  const rb = await fetch(base + '/b')
  assert.strictEqual(rb.headers.get('content-type'), 'application/octet-stream')
  assert.strictEqual(await rb.text(), 'rawbytes')
  const rn = await fetch(base + '/n')
  assert.strictEqual(await rn.text(), '')
  close()
})

test('res.status/set/get/type/sendStatus/redirect/locals/append', async () => {
  const app = express()
  app.get('/x', (req, res) => {
    res.locals['who'] = 'me'
    res.status(201)
    res.set('x-a', '1')
    res.append('x-a', '2')
    res.type('json')
    res.send({ who: res.locals['who'], saw: res.get('x-a') })
  })
  app.get('/ss', (req, res) => res.sendStatus(403))
  app.get('/r1', (req, res) => res.redirect('/x'))
  app.get('/r2', (req, res) => res.redirect(301, '/x'))
  const { base, close } = await listen(app)
  const rx = await fetch(base + '/x')
  assert.strictEqual(rx.status, 201)
  assert.strictEqual(rx.headers.get('x-a'), '1, 2')
  assert.deepStrictEqual(await rx.json(), { who: 'me', saw: '1, 2' })
  const rss = await fetch(base + '/ss')
  assert.strictEqual(rss.status, 403)
  assert.strictEqual(await rss.text(), 'Forbidden')
  const rr1 = await fetch(base + '/r1', { redirect: 'manual' })
  assert.strictEqual(rr1.status, 302)
  assert.strictEqual(rr1.headers.get('location'), '/x')
  const rr2 = await fetch(base + '/r2', { redirect: 'manual' })
  assert.strictEqual(rr2.status, 301)
  close()
})

test('app.set/setting/enable/disable/enabled + x-powered-by off', async () => {
  const app = express()
  app.set('env', 'test')
  app.disable('x-powered-by')
  assert.strictEqual(app.setting('env'), 'test')
  assert.strictEqual(app.enabled('env'), false)
  app.enable('feature')
  assert.strictEqual(app.enabled('feature'), true)
  assert.strictEqual(app.disabled('x-powered-by'), true)
  app.get('/x', (req, res) => res.send('x'))
  const { base, close } = await listen(app)
  const res = await fetch(base + '/x')
  assert.strictEqual(res.headers.get('x-powered-by'), null)
  close()
})

test('404 — middleware runs for unmatched path, then "Cannot GET"', async () => {
  const app = express()
  app.use((req, res, next) => {
    res.set('x-saw-404', 'yes')
    next()
  })
  app.get('/exists', (req, res) => res.send('e'))
  const { base, close } = await listen(app)
  const res = await fetch(base + '/missing')
  assert.strictEqual(res.status, 404)
  assert.strictEqual(res.headers.get('x-saw-404'), 'yes')
  assert.strictEqual(await res.text(), 'Cannot GET /missing')
  close()
})

test('post-route middleware runs when route handler calls next()', async () => {
  const app = express()
  app.get('/x', (req, res, next) => {
    next()
  })
  app.use((req, res, next) => {
    res.status(200).send('fell through to catchall')
  })
  const { base, close } = await listen(app)
  const res = await fetch(base + '/x')
  assert.strictEqual(await res.text(), 'fell through to catchall')
  close()
})

test("next('route') ends the route fn list and falls through", async () => {
  const app = express()
  app.get('/x', (req, res, next) => {
    next('route')
  })
  app.use((req, res, next) => {
    res.send('tail')
  })
  const { base, close } = await listen(app)
  const res = await fetch(base + '/x')
  assert.strictEqual(await res.text(), 'tail')
  close()
})

test('405 + Allow for method mismatch (ch3 semantics, not express 404)', async () => {
  const app = express()
  app.get('/onlyget', (req, res) => res.send('g'))
  const { base, close } = await listen(app)
  const res = await fetch(base + '/onlyget', { method: 'POST' })
  assert.strictEqual(res.status, 405)
  assert.strictEqual(res.headers.get('allow'), 'GET')
  close()
})

test('auto-HEAD dispatches GET handler with empty body', async () => {
  const app = express()
  app.get('/heady', (req, res) => res.send('body-content'))
  const { base, close } = await listen(app)
  const res = await fetch(base + '/heady', { method: 'HEAD' })
  assert.strictEqual(res.status, 200)
  assert.strictEqual(await res.text(), '')
  close()
})

test('wildcard + trailing-slash normalization', async () => {
  const app = express()
  app.get('/files/*', (req, res) => res.send(req.params['*']))
  app.get('/trail', (req, res) => res.send('t'))
  const { base, close } = await listen(app)
  const r1 = await fetch(base + '/files/a/b/c.txt')
  assert.strictEqual(await r1.text(), 'a/b/c.txt')
  const r2 = await fetch(base + '/trail/')
  assert.strictEqual(await r2.text(), 't')
  close()
})

test('app.all registers every method', async () => {
  const app = express()
  app.all('/any', (req, res) => res.send('m:' + req.method))
  const { base, close } = await listen(app)
  const r1 = await fetch(base + '/any', { method: 'PUT' })
  assert.strictEqual(await r1.text(), 'm:PUT')
  const r2 = await fetch(base + '/any', { method: 'PATCH' })
  assert.strictEqual(await r2.text(), 'm:PATCH')
  close()
})

test('async handlers throw at wrap time', () => {
  const app = express()
  assert.throws(() => {
    app.get('/a', async () => {})
  }, /async handlers unsupported under ch3/)
  assert.throws(() => {
    app.use(async () => {})
  }, /async handlers unsupported under ch3/)
  assert.throws(() => {
    app.use(errorHandler(async () => {}))
  }, /async handlers unsupported under ch3/)
})

test('unsupported res methods throw loudly', () => {
  const app = express()
  app.get('/x', (req, res) => {
    assert.throws(() => res.render(), /res\.render unsupported/)
    assert.throws(() => res.cookie(), /res\.cookie unsupported/)
    assert.throws(() => res.sendFile(), /res\.sendFile unsupported/)
    res.send('ok')
  })
  return listen(app).then(async ({ base, close }) => {
    const res = await fetch(base + '/x')
    assert.strictEqual(await res.text(), 'ok')
    close()
  })
})

test('app.locals shared across requests', async () => {
  const app = express()
  app.locals['title'] = 'site'
  app.get('/x', (req, res) => res.send(String(req.app.locals['title'])))
  const { base, close } = await listen(app)
  const res = await fetch(base + '/x')
  assert.strictEqual(await res.text(), 'site')
  close()
})
