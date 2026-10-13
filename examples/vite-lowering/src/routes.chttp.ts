// Route-registration module — picked up by @chttp/unplugin via the
// `*.chttp.ts` filename convention. Every literal registration below is
// lowered into .chttp/routes.gen.ts; the non-literal one stays on the
// runtime path and still works through the fallback.
import { createRouter } from 'chttp'

export const app = createRouter()

// literal routes — lowered at build time
app.get('/json', (c) => c.json({ hello: 'world' }))
app.get('/user/:id', (c) => c.json({ id: c.req.param('id') }))

// middleware via app.use — snapshot semantics, applied to every route
// registered after it
app.use((c, next) => {
  c.header('x-mw', '1')
  next()
})
app.get('/mwd', (c) => c.text('with-mw'))

// non-literal path — the plugin bails on this one, emits a build
// warning, and leaves it to runtime registration (served through the
// fallback in app.serve)
const dyn = '/dyn'
app.get(dyn, (c) => c.text('dynamic'))
