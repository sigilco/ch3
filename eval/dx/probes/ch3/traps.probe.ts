// Compile traps for ch3. Each marked line SHOULD produce a tsc
// diagnostic; the judge records whether it did.
import { createRouter } from '@sigilco/ch3'

const app = createRouter()

app.get('/user/:id', (c) => {
  const n = c.req.param('nam') // @dx-expect-error[param-name]
  c.json({ n: n })
})

app.get('/user/:id/again', (c) => {
  const o = c.req.param('org') // @dx-expect-error[param-on-unmatched-route]
  c.json({ o: o })
})

app.get('no-slash', (c) => { // @dx-expect-error[bad-path]
  c.text('x')
})

app.get('/async2', async (c) => { // @dx-expect-error[async-handler]
  c.text('x')
})

app.get('/q', (c) => {
  const v = c.req.param('limit') // @dx-expect-error[query-not-param]
  c.json({ v: v })
})

app.get('/arity', (a, b, d, e) => { // @dx-expect-error[handler-arity]
  d.text('x')
})
