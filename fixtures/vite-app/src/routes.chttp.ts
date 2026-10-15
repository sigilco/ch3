// Route-registration module — picked up by unplugin-chttp via the
// `*.chttp.ts` filename convention. Every literal registration below is
// lowered into .chttp/routes.gen.ts; the non-literal one stays on the
// runtime path and still works through the fallback.
import { createRouter } from './chttp.ts'
import * as v from '@chttp/val'

export const app = createRouter()

const EchoIn = v.object({ msg: v.string() })

app.get('/json', (c) => c.json({ hello: 'world' }))
app.get('/user/:id', (c) => c.json({ id: c.req.param('id') }))
app.get('/files/*', (c) => c.text(c.req.param('*') || ''))
app.get('/q', (c) => c.text(c.req.query('x') || ''))
app.post('/echo', (c) => c.text(c.req.body()), { body: true })
// module-level val schema over the body: the plugin's OpenAPI side channel
// picks this up into .chttp/routes.openapi.ts (requestBody on POST /echo2)
app.post('/echo2', (c) => {
  const r = v.safeParse(EchoIn, JSON.parse(c.req.body()))
  if (!r.success) return c.json({ errors: r.issues.length }, 400)
  return c.json({ ok: true })
}, { body: true })
app.get('/redir', (c) => c.redirect('/json'))

const api = createRouter()
api.get('/health', (c) => c.json({ ok: true }))
api.get('/deep/:id', (c) => c.json({ deep: c.req.param('id') }))
app.route('/api', api)

app.use((c, next) => {
  c.header('x-mw', '1')
  next()
})
app.get('/mwd', (c) => c.text('with-mw'))
app.all('/any', (c) => c.text('any:' + c.req.method))

// non-literal path — the plugin bails on this one, emits a warning, and
// leaves it to runtime registration (served through the fallback)
const dyn = '/dyn'
app.get(dyn, (c) => c.text('dynamic'))

// declared multipart — runtime owns the stream; the plugin must decline it
app.post('/upload', (c) => c.json({ t: c.req.field('title') }), {
  multipart: { maxFileBytes: 1024 },
})

app.notFound((c) => {
  c.status(404)
  c.text('not found')
})
