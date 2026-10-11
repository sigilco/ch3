import express from 'express'
import type { Listener } from '../../lib/types'

function numOr(v: unknown, d: number): number {
  if (typeof v !== 'string') {
    return d
  }
  const n = Number(v)
  return isNaN(n) ? d : n
}

export default function build(): Listener {
  const app = express()
  app.get('/search', (req, res) => {
    const t = req.query.tag
    const tags = t === undefined ? [] : Array.isArray(t) ? t : [t]
    const q = req.query.q
    res.json({
      tags: tags,
      limit: numOr(req.query.limit, 20),
      offset: numOr(req.query.offset, 0),
      q: typeof q === 'string' ? q : null,
    })
  })
  return app
}
