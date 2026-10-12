// ch3 demo — same file runs under node, bun, and `scriptc build`.
// Usage: <runtime> app.js [port]   (default 3000)
import { createRouter } from 'ch3'

const app = createRouter()

app.use((c, next) => {
  c.header('x-powered-by', 'ch3')
  next()
})

app.get('/json', (c) => c.json({ hello: 'world' }))

app.get('/user/:id', (c) => c.json({ id: c.req.param('id') }))

app.get('/q', (c) => c.text(c.req.query('x') || ''))

app.get('/wild/*', (c) => c.text(c.req.param('*') || ''))

app.post('/echo', (c) => c.text(c.req.body()))

app.get('/redir', (c) => c.redirect('/json'))

app.notFound((c) => {
  c.status(404)
  c.text('not found')
})

const port = process.argv.length > 2 ? Number(process.argv[2]) : 3000
app.serve({ port: port })
console.log('ch3 demo listening on :' + port)
