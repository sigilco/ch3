import { createApp, createRouter, eventHandler, getQuery, toNodeListener } from 'h3'
import type { Listener } from '../../lib/types'

function numOr(v: unknown, d: number): number {
  if (typeof v !== 'string') {
    return d
  }
  const n = Number(v)
  return isNaN(n) ? d : n
}

export default function build(): Listener {
  const app = createApp()
  const router = createRouter()
  router.get('/search', eventHandler((e) => {
    const q = getQuery(e)
    const t = q.tag
    const tags = t === undefined ? [] : Array.isArray(t) ? t : [t]
    return {
      tags: tags,
      limit: numOr(q.limit, 20),
      offset: numOr(q.offset, 0),
      q: typeof q.q === 'string' ? q.q : null,
    }
  }))
  app.use(router.handler)
  return toNodeListener(app)
}
