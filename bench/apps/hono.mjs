// hono canonical app — @hono/node-server adapter.
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { MIXED_STATIC, MIXED_PARAM, MIXED_WILD } from './common.mjs'

const app = new Hono()

app.get('/json', (c) => c.json({ hello: 'world' }))
app.get('/user/:id', (c) => c.json({ id: c.req.param('id') }))
app.post('/echo', async (c) => c.text(await c.req.text()))
app.get('/deep/a/b/c/d/e', (c) => c.json({ ok: true }))
app.get('/files/:splat{.+}', (c) => c.text(c.req.param('splat')))

for (const p of MIXED_STATIC) app.get(p, (c) => c.json({ ok: true }))
for (const p of MIXED_PARAM) app.get(p, (c) => c.json({ ok: true }))
for (const p of MIXED_WILD) app.get(p.replace(/\/\*$/, '/:splat{.+}'), (c) => c.json({ ok: true }))

serve({ fetch: app.fetch, port: 3000 }, (info) => {
  console.log(`hono+node listening on :${info.port}`)
})
