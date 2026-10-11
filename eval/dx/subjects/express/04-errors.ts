import express from 'express'
import type { Listener } from '../../lib/types'

export default function build(): Listener {
  const app = express()

  app.get('/boom', (req, res) => {
    throw new Error('boom')
  })
  app.get('/handled', (req, res, next) => {
    const err = new Error('bad input') as Error & { status: number }
    err.status = 400
    next(err)
  })
  // Canonical express error middleware: 4-arity, last in the chain.
  app.use((err: Error & { status?: number }, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      next(err)
      return
    }
    res.status(err.status === undefined ? 500 : err.status).json({ error: err.message })
  })
  return app
}
