import { createRouter } from '@sigilco/ch3'
import type { Listener } from '../../lib/types'

export default function build(): Listener {
  const v1 = createRouter()
  v1.get('/items', (c) => {
    c.json({ v: 1, items: [] })
  })
  const v2 = createRouter()
  v2.get('/items', (c) => {
    c.json({ v: 2, items: [] })
  })

  const app = createRouter()
  app.route('/v1', v1)
  app.route('/v2', v2)
  return app.handler()
}
