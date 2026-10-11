import { createRouter } from '@sigilco/ch3'
import type { Listener } from '../../lib/types'

function numOr(v: string | null, d: number): number {
  if (v === null) {
    return d
  }
  const n = Number(v)
  return isNaN(n) ? d : n
}

export default function build(): Listener {
  const app = createRouter()
  app.get('/search', (c) => {
    // c.req.query()/queryAll() collapse repeated keys, so arrays need a
    // raw-URL re-parse — the honest workaround for a missing queries() API.
    const u = new URL(String(c.req.raw.url || '/'), 'http://localhost')
    const tags = u.searchParams.getAll('tag')
    const q = u.searchParams.get('q')
    c.json({
      tags: tags,
      limit: numOr(c.req.query('limit'), 20),
      offset: numOr(c.req.query('offset'), 0),
      q: q,
    })
  })
  return app.handler()
}
