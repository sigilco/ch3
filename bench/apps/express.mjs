// express canonical app. Runs under both `node` and `bun` — same file.
import express from 'express'
import { MIXED_STATIC, MIXED_PARAM, MIXED_WILD } from './common.mjs'

const app = express()
app.disable('x-powered-by')

app.get('/json', (req, res) => res.json({ hello: 'world' }))
app.get('/user/:id', (req, res) => res.json({ id: req.params.id }))
app.post('/echo', express.text({ type: () => true }), (req, res) => res.type('text/plain').send(req.body))
app.get('/deep/a/b/c/d/e', (req, res) => res.json({ ok: true }))
app.get('/files/*splat', (req, res) => res.type('text/plain').send(req.params.splat.join('/')))

for (const p of MIXED_STATIC) app.get(p, (req, res) => res.json({ ok: true }))
for (const p of MIXED_PARAM) app.get(p, (req, res) => res.json({ ok: true }))
for (const p of MIXED_WILD) app.get(p.replace(/\/\*$/, '/*w'), (req, res) => res.json({ ok: true }))

app.listen(3000, () => {
  console.log('express listening on :3000')
})
