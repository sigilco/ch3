import express from 'express'
import type { Listener } from '../../lib/types'

export default function build(): Listener {
  const app = express()
  // Registered adversarially: wildcard first, static last. Express matches
  // in registration order, so this ordering is expected to diverge.
  app.get('/assets/*', (req, res) => {
    const params = req.params as Record<string, string>
    res.json({ kind: 'wild', path: params[0] })
  })
  app.get('/assets/:name', (req, res) => {
    res.json({ kind: 'param', name: req.params.name })
  })
  app.get('/assets/logo.png', (req, res) => {
    res.json({ kind: 'static' })
  })
  return app
}
