// test/smoke-express.ts — scriptc compile smoke for the ch3/express shim.
// `scriptc build test/smoke-express.ts` (no --dynamic) must produce a serving
// binary. run-express.sh stubs src/index.ts when the real core hasn't landed.

import * as express from '../src/shims/express.ts'
import { errorHandler } from '../src/shims/express.ts'

const app = express.express()

app.use(express.json())

app.use((req, res, next) => {
  res.set('x-powered-by-check', 'ch3-express')
  next()
})

app.get('/json', (req, res) => {
  res.json({ hello: 'world' })
})

app.get('/user/:id', (req, res) => {
  res.json({ id: req.params['id'] })
})

app.get('/files/*', (req, res) => {
  res.send(req.params['*'])
})

app.post('/echo', (req, res) => {
  res.json({ parsed: req.body !== null })
})

app.get('/boom', (req, res) => {
  throw new Error('smoke boom')
})

app.use(
  errorHandler((err, req, res, next) => {
    res.status(500).json({ error: 'handled' })
  }),
)

const sub = express.Router()
sub.get('/health', (req, res) => {
  res.json({ ok: true })
})
app.mount('/api', sub)

app.listen(8080)
