import { createRouter } from '@sigilco/ch3'
import type { Listener } from '../../lib/types'

export default function build(): Listener {
  const app = createRouter()
  // Registered adversarially: wildcard first, static last.
  app.get('/assets/*', (c) => {
    c.json({ kind: 'wild', path: c.req.param('*') })
  })
  app.get('/assets/:name', (c) => {
    c.json({ kind: 'param', name: c.req.param('name') })
  })
  app.get('/assets/logo.png', (c) => {
    c.json({ kind: 'static' })
  })
  return app.handler()
}
