import { Hono } from 'hono'
import { getRequestListener } from '@hono/node-server'
import type { Listener } from '../../lib/types'

export default function build(): Listener {
  const v1 = new Hono().basePath('/v1')
  v1.get('/items', (c) => c.json({ v: 1, items: [] }))
  const v2 = new Hono().basePath('/v2')
  v2.get('/items', (c) => c.json({ v: 2, items: [] }))

  const app = new Hono()
  app.route('/', v1)
  app.route('/', v2)
  return getRequestListener(app.fetch)
}
