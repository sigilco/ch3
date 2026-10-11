// test/smoke-hono.ts — scriptc compile smoke for the ch3/hono shim.
// `scriptc build test/smoke-hono.ts` (no --dynamic) must produce a serving
// binary. run-hono.sh stubs src/index.ts when the real core hasn't landed.

import { Hono } from '../src/shims/hono.ts'

const app = new Hono()

app.use((c, next) => {
  c.header('x-powered-by', 'ch3-hono')
  next()
})

app.get('/json', (c) => c.json({ hello: 'world' }))
app.get('/user/:id', (c) => c.json({ id: c.req.param('id') }))
app.get('/files/*', (c) => c.text(c.req.param('*') || ''))
app.post('/echo', (c) => c.text(c.req.text()))
app.notFound((c) => c.status(404).text('not found'))

app.serve({ port: 8080, hostname: null, maxBodyBytes: null })
