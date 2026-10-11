import { Hono } from 'hono'
import { getRequestListener } from '@hono/node-server'
import type { Listener } from '../../lib/types'

export default function build(): Listener {
  const api = new Hono()
  api.get('/data', (c) => c.json({ data: 'secret' }))
  api.get('/more', (c) => c.json({ data: 'more' }))

  const app = new Hono()
  app.get('/health', (c) => c.json({ ok: true }))
  app.use('/api/*', async (c, next) => {
    if (c.req.query('token') === undefined) {
      return c.json({ error: 'unauthorized' }, 401)
    }
    c.header('x-guard', 'api')
    await next()
  })
  app.route('/api', api)
  return getRequestListener(app.fetch)
}
