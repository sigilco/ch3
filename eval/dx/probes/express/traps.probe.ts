// Compile traps for express.
import express from 'express'

const app = express()

app.get('/user/:id', (req, res) => {
  const n = req.params.nam // @dx-expect-error[param-name]
  res.json({ n: n })
})

app.get('/user/:id/again', (req, res) => {
  const o = req.params.org // @dx-expect-error[param-on-unmatched-route]
  res.json({ o: o })
})

app.get('no-slash', (req, res) => { // @dx-expect-error[bad-path]
  res.send('x')
})

app.get('/async2', async (req, res) => { // @dx-expect-error[async-handler]
  res.send('x')
})

app.get('/q', (req, res) => {
  const v = req.params.limit // @dx-expect-error[query-not-param]
  res.json({ v: v })
})

app.get('/arity', (a, b, d, e) => { // @dx-expect-error[handler-arity]
  d.text('x')
})
