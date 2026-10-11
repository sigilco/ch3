import { createApp, createRouter, defineEventHandler, getRouterParam, readBody, setResponseStatus, toNodeListener } from 'h3'
import type { Listener } from '../../lib/types'

export default function build(): Listener {
  const app = createApp()
  const router = createRouter()

  router.get('/users', defineEventHandler(() => {
    return []
  }))
  router.get('/users/:id', defineEventHandler((e) => {
    return { id: getRouterParam(e, 'id') }
  }))
  router.post('/users', defineEventHandler(async (e) => {
    const b = await readBody(e).catch(() => null)
    if (b === null || typeof b.name !== 'string') {
      setResponseStatus(e, 400)
      return { error: 'name required' }
    }
    setResponseStatus(e, 201)
    return { name: b.name }
  }))
  router.put('/users/:id', defineEventHandler(async (e) => {
    const b = await readBody(e).catch(() => null)
    if (b === null || typeof b.name !== 'string') {
      setResponseStatus(e, 400)
      return { error: 'name required' }
    }
    return { id: getRouterParam(e, 'id'), name: b.name }
  }))
  router.delete('/users/:id', defineEventHandler((e) => {
    setResponseStatus(e, 204)
    return null
  }))
  app.use(router.handler)
  return toNodeListener(app)
}
