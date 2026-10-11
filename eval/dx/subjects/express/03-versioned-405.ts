import express from 'express'
import type { Listener } from '../../lib/types'

export default function build(): Listener {
  const v1 = express.Router()
  v1.get('/items', (req, res) => {
    res.json({ v: 1, items: [] })
  })
  const v2 = express.Router()
  v2.get('/items', (req, res) => {
    res.json({ v: 2, items: [] })
  })

  const app = express()
  app.use('/v1', v1)
  app.use('/v2', v2)
  return app
}
