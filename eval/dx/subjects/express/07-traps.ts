import express from 'express'
import type { Listener } from '../../lib/types'

export default function build(): Listener {
  const app = express()

  // Async handler that throws after an await. Express 4 does not await
  // handlers; the rejection becomes an unhandledRejection and the client
  // hangs.
  app.get('/async', async (req, res) => {
    await Promise.resolve()
    throw new Error('async boom')
  })

  // Two response writes. res.send after res.json throws
  // ERR_HTTP_HEADERS_SENT inside the handler; express catches it into
  // the error path.
  app.get('/double', (req, res) => {
    res.json({ a: 1 })
    res.send('second')
  })
  return app
}
