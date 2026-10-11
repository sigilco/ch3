import { createApp, createRouter, eventHandler, toNodeListener } from 'h3'
import type { Listener } from '../../lib/types'

export default function build(): Listener {
  const app = createApp()
  const router = createRouter()

  // Async handler that throws after an await. h3 is async-native, so the
  // rejection is caught by its error path.
  router.get('/async', eventHandler(async () => {
    await Promise.resolve()
    throw new Error('async boom')
  }))

  // Two response "writes": res.end() then a returned value. h3 detects a
  // finished response and skips the returned value (or errors) — recorded.
  router.get('/double', eventHandler((e) => {
    e.node.res.setHeader('content-type', 'application/json')
    e.node.res.end(JSON.stringify({ a: 1 }))
    return { b: 2 }
  }))
  app.use(router.handler)
  return toNodeListener(app)
}
