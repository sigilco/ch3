import { createRouter } from '@sigilco/ch3'
import type { Listener } from '../../lib/types'

export default function build(): Listener {
  const api = createRouter()
  api.use((c, next) => {
    if (c.req.query('token') === null) {
      c.status(401).json({ error: 'unauthorized' })
      return
    }
    c.header('x-guard', 'api')
    next()
  })
  api.get('/data', (c) => {
    c.json({ data: 'secret' })
  })
  api.get('/more', (c) => {
    c.json({ data: 'more' })
  })

  const app = createRouter()
  app.get('/health', (c) => {
    c.json({ ok: true })
  })
  app.route('/api', api)
  return app.handler()
}
