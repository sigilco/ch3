import { createApp, createError, createRouter, eventHandler, toNodeListener } from 'h3'
import type { Listener } from '../../lib/types'

export default function build(): Listener {
  const app = createApp({
    onError: (error, event) => {
      event.node.res.statusCode = error.statusCode || 500
      event.node.res.setHeader('content-type', 'application/json; charset=utf-8')
      event.node.res.end(JSON.stringify({ error: error.message || 'error' }))
    },
  })
  const router = createRouter()

  router.get('/boom', eventHandler(() => {
    throw new Error('boom')
  }))
  router.get('/handled', eventHandler(() => {
    throw createError({ statusCode: 400, statusMessage: 'bad input' })
  }))
  app.use(router.handler)
  return toNodeListener(app)
}
