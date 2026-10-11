import express from 'express'
import type { Listener } from '../../lib/types'

export default function build(): Listener {
  const api = express.Router()
  api.use((req, res, next) => {
    if (req.query.token === undefined) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
    res.set('x-guard', 'api')
    next()
  })
  api.get('/data', (req, res) => {
    res.json({ data: 'secret' })
  })
  api.get('/more', (req, res) => {
    res.json({ data: 'more' })
  })

  const app = express()
  app.get('/health', (req, res) => {
    res.json({ ok: true })
  })
  app.use('/api', api)
  return app
}
