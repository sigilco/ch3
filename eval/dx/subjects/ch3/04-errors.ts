import { createRouter } from '@sigilco/ch3'
import type { Listener } from '../../lib/types'

export default function build(): Listener {
  const app = createRouter()

  app.get('/boom', (c) => {
    throw new Error('boom')
  })
  // ch3 core-v0 has no error hook and no HttpError class: an early
  // status+json return is the only mechanism for a typed error.
  app.get('/handled', (c) => {
    c.status(400).json({ error: 'bad input' })
  })
  return app.handler()
}
