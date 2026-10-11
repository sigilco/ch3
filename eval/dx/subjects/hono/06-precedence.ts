import { Hono } from 'hono'
import { getRequestListener } from '@hono/node-server'
import type { Listener } from '../../lib/types'

export default function build(): Listener {
  const app = new Hono()
  // Registered adversarially: wildcard first, static last.
  app.get('/assets/*', (c) => {
    return c.json({ kind: 'wild', path: c.req.path.slice('/assets/'.length) })
  })
  app.get('/assets/:name', (c) => {
    return c.json({ kind: 'param', name: c.req.param('name') })
  })
  app.get('/assets/logo.png', (c) => {
    return c.json({ kind: 'static' })
  })
  return getRequestListener(app.fetch)
}
