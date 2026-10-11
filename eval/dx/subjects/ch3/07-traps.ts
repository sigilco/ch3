import { createRouter } from '@sigilco/ch3'
import type { Listener } from '../../lib/types'

export default function build(): Listener {
  const app = createRouter()

  // Async handler that throws after an await. ch3 handlers are sync-only;
  // the rejection escapes the dispatch chain entirely.
  app.get('/async', async (c) => {
    await Promise.resolve()
    throw new Error('async boom')
  })

  // Two response writes. The second setHeader-after-end throws inside the
  // handler and is caught by dispatch's try/catch.
  app.get('/double', (c) => {
    c.json({ a: 1 })
    c.text('second')
  })
  return app.handler()
}
