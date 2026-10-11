// find-my-way canonical app — router.lookup over raw node:http.
// Runs under both `node` and `bun` (bun's node:http compat) — same file.
import FindMyWay from 'find-my-way'
import * as http from 'node:http'
import { MIXED_STATIC, MIXED_PARAM, MIXED_WILD } from './common.mjs'

const router = FindMyWay()

const json = (res, s) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(s) }
const text = (res, s) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end(s) }

router.get('/json', (req, res) => json(res, '{"hello":"world"}'))
router.get('/user/:id', (req, res, params) => json(res, JSON.stringify({ id: params.id })))
router.post('/echo', (req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end(Buffer.concat(chunks)) })
})
router.get('/deep/a/b/c/d/e', (req, res) => json(res, '{"ok":true}'))
router.get('/files/*', (req, res, params) => text(res, params['*'] ?? ''))

for (const p of MIXED_STATIC) router.get(p, (req, res) => json(res, '{"ok":true}'))
for (const p of MIXED_PARAM) router.get(p, (req, res) => json(res, '{"ok":true}'))
for (const p of MIXED_WILD) router.get(p, (req, res) => json(res, '{"ok":true}'))

http.createServer((req, res) => router.lookup(req, res)).listen(3000, () => {
  console.log('find-my-way listening on :3000')
})
