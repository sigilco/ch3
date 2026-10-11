import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getRequestListener } from '@hono/node-server'
import type { Listener } from '../../lib/types'

export default function build(): Listener {
  const app = new Hono()

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: err.message }, err.status)
    }
    return c.json({ error: err.message }, 500)
  })

  app.get('/boom', (c) => {
    throw new Error('boom')
  })
  app.get('/handled', (c) => {
    throw new HTTPException(400, { message: 'bad input' })
  })
  return getRequestListener(app.fetch)
}
