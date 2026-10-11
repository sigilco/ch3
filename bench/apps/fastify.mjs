// fastify canonical app — its native router IS find-my-way (the fmw-node row
// is therefore the "router only" companion cell; this row includes fastify's
// request lifecycle: hooks, content-type parsing, reply object).
// Runs under both `node` and `bun` (bun's node:http compat) — same file.
import Fastify from 'fastify'
import { MIXED_STATIC, MIXED_PARAM, MIXED_WILD } from './common.mjs'

const app = Fastify({ logger: false, disableRequestLogging: true })

// web-frameworks suite: GET / (empty), POST /user (empty), GET /user/:id.
app.get('/', (req, reply) => reply.send())
app.get('/user/:id', (req, reply) => reply.send({ id: req.params.id }))
app.post('/user', (req, reply) => reply.send())
// Raygun-style plaintext hello-world cell.
app.get('/hello', (req, reply) => reply.type('text/plain').send('Hello World!'))

app.get('/json', (req, reply) => reply.send({ hello: 'world' }))
app.post('/echo', (req, reply) => reply.type('text/plain').send(req.body))
app.get('/deep/a/b/c/d/e', (req, reply) => reply.send({ ok: true }))
app.get('/files/*', (req, reply) => reply.type('text/plain').send(req.params['*'] ?? ''))

for (const p of MIXED_STATIC) app.get(p, (req, reply) => reply.send({ ok: true }))
for (const p of MIXED_PARAM) app.get(p, (req, reply) => reply.send({ ok: true }))
for (const p of MIXED_WILD) app.get(p, (req, reply) => reply.send({ ok: true }))

app.listen({ port: 3000, host: '127.0.0.1' }).then(() => {
  console.log('fastify listening on :3000')
})
