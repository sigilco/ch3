import { Hono } from 'hono'
import { getRequestListener } from '@hono/node-server'
import type { Listener } from '../../lib/types'

export default function build(): Listener {
  const app = new Hono()

  app.get('/users', (c) => c.json([]))
  app.get('/users/:id', (c) => c.json({ id: c.req.param('id') }))
  app.post('/users', async (c) => {
    const b = await c.req.json().catch(() => null)
    if (b === null || typeof b.name !== 'string') {
      return c.json({ error: 'name required' }, 400)
    }
    return c.json({ name: b.name }, 201)
  })
  app.put('/users/:id', async (c) => {
    const b = await c.req.json().catch(() => null)
    if (b === null || typeof b.name !== 'string') {
      return c.json({ error: 'name required' }, 400)
    }
    return c.json({ id: c.req.param('id'), name: b.name })
  })
  app.delete('/users/:id', (c) => c.body(null, 204))
  return getRequestListener(app.fetch)
}
