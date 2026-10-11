// Route-registration module — picked up by unplugin-ch3 via the
// `*.ch3.ts` filename convention. Every literal registration below is
// lowered into .ch3/routes.gen.ts; the non-literal one stays on the
// runtime path and still works through the fallback.
import { createRouter } from './ch3.ts'

export const app = createRouter()

app.get('/json', (c) => c.json({ hello: 'world' }))
app.get('/user/:id', (c) => c.json({ id: c.req.param('id') }))
app.get('/files/*', (c) => c.text(c.req.param('*') || ''))
app.get('/q', (c) => c.text(c.req.query('x') || ''))
app.post('/echo', (c) => c.text(c.req.body()))
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

app.notFound((c) => {
  c.status(404)
  c.text('not found')
})
