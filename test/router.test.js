import test from 'node:test'
import assert from 'node:assert/strict'
import { createRouter } from '../dist/esm/index.js'

function mkReq(opts = {}) {
  const cbs = {}
  const req = {
    method: opts.method || 'GET',
    url: opts.url || '/',
    headers: opts.headers || {},
    on(ev, cb) {
      cbs[ev] = cb
    },
  }
  const emit = (body) => {
    if (body !== undefined && cbs.data) {
      cbs.data({ toString: () => body })
    }
    if (cbs.end) {
      cbs.end()
    }
  }
  return { req, emit }
}

function mkRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    ended: false,
    headersSent: false,
    destroyed: false,
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v
    },
    end(b) {
      this.ended = true
      this.headersSent = true
      if (typeof b === 'string') {
        this.body = b
      }
    },
    destroy() {
      this.destroyed = true
    },
  }
  return res
}

const call = (app, opts, body) => {
  const { req, emit } = mkReq(opts)
  const res = mkRes()
  app.handler()(req, res)
  emit(body)
  return res
}

test('static route matches and json writes headers + body', () => {
  const app = createRouter()
  app.get('/json', (c) => c.json({ hello: 'world' }))
  const res = call(app, { url: '/json' })
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  assert.equal(JSON.parse(res.body).hello, 'world')
  assert.equal(res.headers['content-length'], String(Buffer.byteLength(res.body)))
})

test('param route captures and param() returns value', () => {
  const app = createRouter()
  app.get('/user/:id', (c) => c.json({ id: c.req.param('id') }))
  const res = call(app, { url: '/user/42' })
  assert.equal(JSON.parse(res.body).id, '42')
})

test('param value is percent-decoded', () => {
  const app = createRouter()
  app.get('/u/:id', (c) => c.text(c.req.param('id') || ''))
  const res = call(app, { url: '/u/a%20b' })
  assert.equal(res.body, 'a b')
})

test('missing param returns null', () => {
  const app = createRouter()
  app.get('/u/:id', (c) => c.text(String(c.req.param('nope'))))
  const res = call(app, { url: '/u/1' })
  assert.equal(res.body, 'null')
})

test('wildcard captures rest of path including slashes', () => {
  const app = createRouter()
  app.get('/w/*', (c) => c.text(c.req.param('*') || ''))
  const res = call(app, { url: '/w/a/b/c' })
  assert.equal(res.body, 'a/b/c')
})

test('static beats param at same position', () => {
  const app = createRouter()
  app.get('/user/new', (c) => c.text('new'))
  app.get('/user/:id', (c) => c.text('id:' + (c.req.param('id') || '')))
  assert.equal(call(app, { url: '/user/new' }).body, 'new')
  assert.equal(call(app, { url: '/user/9' }).body, 'id:9')
})

test('param backtracks when static branch wins deeper', () => {
  const app = createRouter()
  app.get('/a/:x/z', (c) => c.text('param:' + (c.req.param('x') || '')))
  app.get('/a/b/c', (c) => c.text('static'))
  assert.equal(call(app, { url: '/a/b/c' }).body, 'static')
  assert.equal(call(app, { url: '/a/q/z' }).body, 'param:q')
})

test('query parsed lazily with + and percent decoding', () => {
  const app = createRouter()
  app.get('/q', (c) =>
    c.json({ x: c.req.query('x'), all: c.req.queryAll() }),
  )
  const res = call(app, { url: '/q?x=1+2&y=a%2Fb&flag' })
  const body = JSON.parse(res.body)
  assert.equal(body.x, '1 2')
  assert.equal(body.all.y, 'a/b')
  assert.equal(body.all.flag, '')
})

test('query on url without ? returns null and empty map', () => {
  const app = createRouter()
  app.get('/q', (c) => c.json({ x: c.req.query('x'), n: Object.keys(c.req.queryAll()).length }))
  const res = call(app, { url: '/q' })
  const body = JSON.parse(res.body)
  assert.equal(body.x, null)
  assert.equal(body.n, 0)
})

test('header lookup is case-insensitive and null when absent', () => {
  const app = createRouter()
  app.get('/h', (c) => c.text(c.req.header('X-Token') || 'none'))
  const res = call(app, { url: '/h', headers: { 'x-token': 'abc' } })
  assert.equal(res.body, 'abc')
  const res2 = call(app, { url: '/h' })
  assert.equal(res2.body, 'none')
})

test('default 404 and custom notFound', () => {
  const app = createRouter()
  app.get('/a', (c) => c.text('a'))
  assert.equal(call(app, { url: '/nope' }).statusCode, 404)

  const app2 = createRouter()
  app2.notFound((c) => {
    c.status(404)
    c.text('not found')
  })
  const res = call(app2, { url: '/x' })
  assert.equal(res.statusCode, 404)
  assert.equal(res.body, 'not found')
})

test('method dispatch is strict per method', () => {
  const app = createRouter()
  app.get('/r', (c) => c.text('get'))
  app.post('/r', (c) => c.text('post:' + c.req.body()), { body: true })
  assert.equal(call(app, { method: 'GET', url: '/r' }).body, 'get')
  const res = call(app, { method: 'POST', url: '/r' }, 'hi')
  assert.equal(res.body, 'post:hi')
  const del = call(app, { method: 'DELETE', url: '/r' })
  assert.equal(del.statusCode, 405)
  assert.equal(del.headers['allow'], 'GET, HEAD, POST')
  assert.equal(del.headers['head'], undefined)
})

test('body buffers before handler only when route declares body: true', () => {
  const app = createRouter()
  app.post('/echo', (c) => c.text(c.req.body()), { body: true })
  const res = call(app, { method: 'POST', url: '/echo' }, 'hello world')
  assert.equal(res.body, 'hello world')
  assert.equal(res.headers['content-length'], '11')

  // Same handler without the declaration: declared-body contract says
  // no buffering happens and body() returns ''. Deterministic opt-in —
  // see docs/route-contract.md.
  const app2 = createRouter()
  app2.post('/echo', (c) => c.text('[' + c.req.body() + ']'))
  const res2 = call(app2, { method: 'POST', url: '/echo' }, 'ignored')
  assert.equal(res2.body, '[]')
})

test('body: true on a GET route is a no-op', () => {
  const app = createRouter()
  app.get('/g', (c) => c.text('g'), { body: true })
  const res = call(app, { method: 'GET', url: '/g' }, 'payload')
  assert.equal(res.body, 'g')
})

test('HEAD falls back to GET handler', () => {
  const app = createRouter()
  app.get('/g', (c) => c.text('body'))
  const res = call(app, { method: 'HEAD', url: '/g' })
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['content-length'], '4')
})

test('all() matches every method', () => {
  const app = createRouter()
  app.all('/x', (c) => c.text('any'))
  assert.equal(call(app, { method: 'GET', url: '/x' }).body, 'any')
  const res = call(app, { method: 'POST', url: '/x' }, '')
  assert.equal(res.body, 'any')
})

test('middleware runs in registration order before handler', () => {
  const order = []
  const app = createRouter()
  app.use((c, next) => {
    order.push('mw1')
    c.header('x-one', '1')
    next()
  })
  app.use((c, next) => {
    order.push('mw2')
    next()
  })
  app.get('/m', (c) => {
    order.push('h')
    c.text('ok')
  })
  const res = call(app, { url: '/m' })
  assert.deepEqual(order, ['mw1', 'mw2', 'h'])
  assert.equal(res.headers['x-one'], '1')
})

test('middleware registered after a route does not apply to it', () => {
  const hits = []
  const app = createRouter()
  app.get('/early', (c) => c.text('early'))
  app.use((c, next) => {
    hits.push('mw')
    next()
  })
  app.get('/late', (c) => c.text('late'))
  call(app, { url: '/early' })
  assert.deepEqual(hits, [])
  call(app, { url: '/late' })
  assert.deepEqual(hits, ['mw'])
})

test('middleware chain continues into notFound registered later', () => {
  const hits = []
  const app = createRouter()
  app.use((c, next) => {
    hits.push('mw')
    next()
  })
  app.notFound((c) => {
    hits.push('nf')
    c.status(404).text('nf')
  })
  const res = call(app, { url: '/gone' })
  assert.deepEqual(hits, ['mw', 'nf'])
  assert.equal(res.statusCode, 404)
})

test('route() mounts a sub-app under a prefix preserving params', () => {
  const sub = createRouter()
  sub.get('/item/:id', (c) => c.json({ id: c.req.param('id') }))
  sub.get('/', (c) => c.text('subroot'))
  const app = createRouter()
  app.route('/api', sub)
  assert.equal(JSON.parse(call(app, { url: '/api/item/7' }).body).id, '7')
  assert.equal(call(app, { url: '/api' }).statusCode, 404) // mount point itself unclaimed
  assert.equal(call(app, { url: '/api/' }).body, 'subroot')
})

test('route() inherits middleware from both sides', () => {
  const hits = []
  const sub = createRouter()
  sub.use((c, next) => {
    hits.push('sub')
    next()
  })
  sub.get('/x', (c) => c.text('x'))
  const app = createRouter()
  app.use((c, next) => {
    hits.push('parent')
    next()
  })
  app.route('/p', sub)
  call(app, { url: '/p/x' })
  assert.deepEqual(hits, ['parent', 'sub'])
})

test('redirect sets status + location', () => {
  const app = createRouter()
  app.get('/r', (c) => c.redirect('/to'))
  app.get('/r2', (c) => c.redirect('/to', 301))
  const res = call(app, { url: '/r' })
  assert.equal(res.statusCode, 302)
  assert.equal(res.headers.location, '/to')
  assert.equal(call(app, { url: '/r2' }).statusCode, 301)
})

test('throwing handler yields 500 not a crash', () => {
  const app = createRouter()
  app.get('/boom', () => {
    throw new Error('kaboom')
  })
  const res = call(app, { url: '/boom' })
  assert.equal(res.statusCode, 500)
  assert.equal(res.body, 'Internal Server Error')
})

test('on() registers arbitrary methods', () => {
  const app = createRouter()
  app.on('purge', '/cache', (c) => c.text('purged'))
  assert.equal(call(app, { method: 'PURGE', url: '/cache' }).body, 'purged')
})

test('root path and trailing-slash strictness', () => {
  const app = createRouter()
  app.get('/', (c) => c.text('root'))
  assert.equal(call(app, { url: '/' }).body, 'root')
  assert.equal(call(app, { url: '//' }).statusCode, 404)
})

test('non-ascii body gets byte-accurate content-length', () => {
  const app = createRouter()
  app.get('/u', (c) => c.text('héllo → 👋'))
  const res = call(app, { url: '/u' })
  assert.equal(res.headers['content-length'], String(Buffer.byteLength('héllo → 👋')))
})

test('withDispatch generated module takes precedence and can decline', () => {
  return import('../dist/esm/index.js').then(({ GenDispatch, createRouter }) => {
    class Gen extends GenDispatch {
      dispatch(req, res) {
        const url = String(req.url || '/')
        if (url === '/fast') {
          res.statusCode = 200
          res.setHeader('content-type', 'text/plain')
          res.end('gen-hit')
          return true
        }
        return false
      }
    }
    const app = createRouter()
    app.withDispatch(new Gen())
    app.get('/fast', (c) => c.text('internal'))
    app.get('/other', (c) => c.text('internal-other'))
    // gen claims /fast → its response wins over the registered route
    assert.equal(call(app, { url: '/fast' }).body, 'gen-hit')
    // gen declines /other → internal dispatch serves it
    assert.equal(call(app, { url: '/other' }).body, 'internal-other')
  })
})

test('generated dispatch can spawn ctx + seed params + buffer via helpers', () => {
  return import('../dist/esm/index.js').then((m) => {
    const app = m.createRouter()
    class Gen extends m.GenDispatch {
      dispatch(req, res) {
        const url = String(req.url || '/')
        if (url.indexOf('/u/') === 0) {
          const rv = new m.ReqView(req, '', url)
          const c = new m.Ctx(rv, res)
          rv._seedPm(['id', m.dec(url.slice(3))])
          m._guard(res, function () {
            c.json({ id: c.req.param('id') })
          })
          return true
        }
        if (url === '/b') {
          const rv = new m.ReqView(req, '', url)
          const c = new m.Ctx(rv, res)
          m._buffer(req, res, c, function () {
            c.text('b:' + c.req.body())
          })
          return true
        }
        return false
      }
    }
    app.withDispatch(new Gen())
    const res = call(app, { url: '/u/7' })
    assert.equal(JSON.parse(res.body).id, '7')
    const res2 = call(app, { method: 'POST', url: '/b' }, 'hey')
    assert.equal(res2.body, 'b:hey')
    // unknown → internal → 404
    assert.equal(call(app, { url: '/zzz' }).statusCode, 404)
  })
})

test('queries() returns all values for a repeated key in order', () => {
  const app = createRouter()
  app.get('/q', (c) => c.text(c.req.queries('tag').join(',')))
  const res = call(app, { url: '/q?tag=a&x=1&tag=b&tag=c' })
  assert.equal(res.body, 'a,b,c')
})

test('queries() on absent key returns empty array', () => {
  const app = createRouter()
  app.get('/q', (c) => c.text(String(c.req.queries('nope').length)))
  const res = call(app, { url: '/q?x=1' })
  assert.equal(res.body, '0')
})

test('onError handles thrown errors and writes the response', () => {
  const app = createRouter()
  app.get('/boom', () => { throw new Error('kaboom') })
  app.onError((err, c) => c.status(503).json({ error: String((err).message) }))
  const res = call(app, { url: '/boom' })
  assert.equal(res.statusCode, 503)
  assert.equal(res.body, '{"error":"kaboom"}')
})

test('onError that never responds falls back to built-in 500', () => {
  const app = createRouter()
  app.get('/boom', () => { throw new Error('x') })
  app.onError(() => { /* writes nothing */ })
  const res = call(app, { url: '/boom' })
  assert.equal(res.statusCode, 500)
  assert.equal(res.body, 'Internal Server Error')
})

test('onError that throws still yields a single 500', () => {
  const app = createRouter()
  app.get('/boom', () => { throw new Error('x') })
  app.onError(() => { throw new Error('handler bug') })
  const res = call(app, { url: '/boom' })
  assert.equal(res.statusCode, 500)
})

test('no onError registered: default 500 behavior unchanged', () => {
  const app = createRouter()
  app.get('/boom', () => { throw new Error('x') })
  const res = call(app, { url: '/boom' })
  assert.equal(res.statusCode, 500)
})

test('405 surfaces through onError with allow list on the error', () => {
  const app = createRouter()
  app.get('/r', (c) => c.text('get'))
  app.onError((err, c) => {
    c.status(405)
    c.header('allow', String((err).allow))
    c.text('custom 405')
  })
  const res = call(app, { method: 'DELETE', url: '/r' })
  assert.equal(res.statusCode, 405)
  assert.equal(res.body, 'custom 405')
  assert.equal(res.headers['allow'], 'GET,HEAD')
})
