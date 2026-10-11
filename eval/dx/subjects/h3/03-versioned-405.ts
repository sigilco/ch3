import { createApp, createRouter, eventHandler, toNodeListener, useBase } from 'h3'
import type { Listener } from '../../lib/types'

export default function build(): Listener {
  const app = createApp()

  const v1 = createRouter()
  v1.get('/items', eventHandler(() => {
    return { v: 1, items: [] }
  }))
  const v2 = createRouter()
  v2.get('/items', eventHandler(() => {
    return { v: 2, items: [] }
  }))

  app.use('/v1', useBase('/v1', v1.handler))
  app.use('/v2', useBase('/v2', v2.handler))
  return toNodeListener(app)
}
