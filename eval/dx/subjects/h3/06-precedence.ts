import { createApp, createRouter, eventHandler, getRouterParam, toNodeListener } from 'h3'
import type { Listener } from '../../lib/types'

export default function build(): Listener {
  const app = createApp()
  const router = createRouter()
  // Registered adversarially: wildcard first, static last.
  router.get('/assets/**', eventHandler((e) => {
    return { kind: 'wild', path: getRouterParam(e, '_') }
  }))
  router.get('/assets/:name', eventHandler((e) => {
    return { kind: 'param', name: getRouterParam(e, 'name') }
  }))
  router.get('/assets/logo.png', eventHandler(() => {
    return { kind: 'static' }
  }))
  app.use(router.handler)
  return toNodeListener(app)
}
