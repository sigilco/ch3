import { createRouter } from '@sigilco/ch3'
import type { Listener } from '../../lib/types'

export default function build(): Listener {
  const app = createRouter()

  app.get('/users', (c) => {
    c.json([])
  })
  app.get('/users/:id', (c) => {
    c.json({ id: c.req.param('id') })
  })
  app.post('/users', (c) => {
    let name = ''
    try {
      const b = JSON.parse(c.req.body())
      if (b !== null && typeof b.name === 'string') {
        name = b.name
      }
    } catch (e) {
      name = ''
    }
    if (name === '') {
      c.status(400).json({ error: 'name required' })
      return
    }
    c.status(201).json({ name: name })
  })
  app.put('/users/:id', (c) => {
    let name = ''
    try {
      const b = JSON.parse(c.req.body())
      if (b !== null && typeof b.name === 'string') {
        name = b.name
      }
    } catch (e) {
      name = ''
    }
    if (name === '') {
      c.status(400).json({ error: 'name required' })
      return
    }
    c.json({ id: c.req.param('id'), name: name })
  })
  app.delete('/users/:id', (c) => {
    c.status(204).text('')
  })
  return app.handler()
}
