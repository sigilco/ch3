import express from 'express'
import type { Listener } from '../../lib/types'

export default function build(): Listener {
  const app = express()
  app.use(express.json())

  app.get('/users', (req, res) => {
    res.json([])
  })
  app.get('/users/:id', (req, res) => {
    res.json({ id: req.params.id })
  })
  app.post('/users', (req, res) => {
    if (req.body === null || typeof req.body.name !== 'string') {
      res.status(400).json({ error: 'name required' })
      return
    }
    res.status(201).json({ name: req.body.name })
  })
  app.put('/users/:id', (req, res) => {
    if (req.body === null || typeof req.body.name !== 'string') {
      res.status(400).json({ error: 'name required' })
      return
    }
    res.json({ id: req.params.id, name: req.body.name })
  })
  app.delete('/users/:id', (req, res) => {
    res.status(204).end()
  })
  return app
}
