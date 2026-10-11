import { Hono } from 'hono'
import { getRequestListener } from '@hono/node-server'
import type { Listener } from '../../lib/types'

function numOr(v: string | undefined, d: number): number {
  if (v === undefined) {
    return d
  }
  const n = Number(v)
  return isNaN(n) ? d : n
}

export default function build(): Listener {
  const app = new Hono()
  app.get('/search', (c) => {
    const tags = c.req.queries('tag') || []
    const q = c.req.query('q')
    return c.json({
      tags: tags,
      limit: numOr(c.req.query('limit'), 20),
      offset: numOr(c.req.query('offset'), 0),
      q: q === undefined ? null : q,
    })
  })
  return getRequestListener(app.fetch)
}
