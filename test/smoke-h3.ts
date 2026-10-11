// test/smoke-h3.ts — scriptc compile smoke for the ch3/h3 shim.
// `scriptc build test/smoke-h3.ts` (no --dynamic) must produce a serving
// binary. Covers the shim surface end-to-end: app, router mount, scoped
// middleware, params, query, body, errors.

import * as http from 'node:http'
import {
  createApp,
  createError,
  createRouter,
  defineEventHandler,
  getQuery,
  getRouterParam,
  readBody,
  readRawBody,
  sendError,
  setResponseHeader,
  setResponseStatus,
  toNodeListener,
} from '../src/shims/h3.ts'

const app = createApp()

app.use(
  defineEventHandler((e) => {
    setResponseHeader(e, 'x-powered-by', 'ch3-h3')
    e.context['visited'] = true
  })
)

const router = createRouter()
router.get('/json', defineEventHandler(() => ({ hello: 'world' })))
router.get('/user/:id', defineEventHandler((e) => ({ id: getRouterParam(e, 'id') })))
router.get('/files/*', defineEventHandler((e) => getRouterParam(e, '*')))
router.get('/q', defineEventHandler((e) => getQuery(e)))
router.get('/ctx', defineEventHandler((e) => ({ who: e.context['visited'] })))
router.get('/teapot', defineEventHandler(() => {
  throw createError({ statusCode: 418, statusMessage: 'teapot' })
}))
router.get('/err', defineEventHandler((e) => {
  sendError(e, createError({ statusCode: 503, statusMessage: 'down' }))
}))
router.post('/echo', defineEventHandler((e) => readRawBody(e)))
router.post('/obj', defineEventHandler((e) => readBody(e)))
router.get('/status', defineEventHandler((e) => {
  setResponseStatus(e, 201)
  return { ok: true }
}))
app.use(router)
app.use('/api', router)

const server = http.createServer(toNodeListener(app))
server.listen(3000)
