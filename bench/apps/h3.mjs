// h3 (v2) canonical app — node:http adapter via toNodeHandler.
import { H3, toNodeHandler, getRouterParam, readRawBody } from 'h3'
import * as http from 'node:http'
import { MIXED_STATIC, MIXED_PARAM, MIXED_WILD } from './common.mjs'

const app = new H3()

app.get('/', () => '')
app.get('/hello', () => 'Hello World!')
app.get('/json', () => ({ hello: 'world' }))
app.get('/user/:id', (e) => ({ id: getRouterParam(e, 'id') }))
app.post('/echo', async (e) => new Response(await readRawBody(e), { headers: { 'content-type': 'text/plain' } }))
app.post('/user', () => '')
app.get('/deep/a/b/c/d/e', () => ({ ok: true }))
app.get('/files/**', (e) => String(getRouterParam(e, '_') ?? ''))

for (const p of MIXED_STATIC) app.get(p, () => ({ ok: true }))
for (const p of MIXED_PARAM) app.get(p, () => ({ ok: true }))
for (const p of MIXED_WILD) app.get(p.replace(/\/\*$/, '/**'), () => ({ ok: true }))

http.createServer(toNodeHandler(app)).listen(3000, () => {
  console.log('h3+node listening on :3000')
})
