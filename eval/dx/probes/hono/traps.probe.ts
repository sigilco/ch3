// Compile traps for hono.
import { Hono } from 'hono'

const app = new Hono()

app.get('/user/:id', (c) => {
  const n = c.req.param('nam') // @dx-expect-error[param-name]
  return c.json({ n: n })
})

app.get('/user/:id/again', (c) => {
  const o = c.req.param('org') // @dx-expect-error[param-on-unmatched-route]
  return c.json({ o: o })
})

app.get('no-slash', (c) => { // @dx-expect-error[bad-path]
  return c.text('x')
})

app.get('/m', async (c) => {
  const b = c.req.json()
  return c.json({ name: b.name }) // @dx-expect-error[missing-await]
})

app.get('/q', (c) => {
  const v = c.req.param('limit') // @dx-expect-error[query-not-param]
  return c.json({ v: v })
})

app.get('/arity', (a, b, d, e) => { // @dx-expect-error[handler-arity]
  return d.text('x')
})
