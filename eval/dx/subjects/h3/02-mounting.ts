import { appendResponseHeader, createApp, createError, createRouter, eventHandler, getQuery, toNodeListener, useBase } from 'h3'
import type { Listener } from '../../lib/types'

export default function build(): Listener {
  const app = createApp()

  const api = createRouter()
  api.get('/data', eventHandler(() => {
    return { data: 'secret' }
  }))
  api.get('/more', eventHandler(() => {
    return { data: 'more' }
  }))

  // Guard scoped to /api only; returning nothing continues the chain.
  app.use('/api', eventHandler((e) => {
    if (getQuery(e).token === undefined) {
      throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
    }
    appendResponseHeader(e, 'x-guard', 'api')
  }))
  app.use('/api', useBase('/api', api.handler))

  const root = createRouter()
  root.get('/health', eventHandler(() => {
    return { ok: true }
  }))
  app.use(root.handler)
  return toNodeListener(app)
}
