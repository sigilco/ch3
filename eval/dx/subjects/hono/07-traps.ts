import { Hono } from 'hono'
import { getRequestListener } from '@hono/node-server'
import type { Listener } from '../../lib/types'

export default function build(): Listener {
  const app = new Hono()

  // Async handler that throws after an await. Hono awaits handlers, so the
  // rejection is caught by its error path.
  app.get('/async', async (c) => {
    await Promise.resolve()
    throw new Error('async boom')
  })

  // Two response "writes": c.json() constructs a Response that is discarded;
  // whichever the handler returns wins. No error is possible.
  app.get('/double', (c) => {
    c.json({ a: 1 })
    return c.text('second')
  })
  return getRequestListener(app.fetch)
}
