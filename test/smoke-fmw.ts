// test/smoke-fmw.ts — scriptc compile smoke for the ch3/fmw shim.
// `scriptc build test/smoke-fmw.ts` (no --dynamic) must produce a serving binary.

import * as http from 'node:http'
import { FindMyWay } from '../src/shims/fmw.ts'

const router = FindMyWay(null)

router.on('GET', '/json', (_req, res) => {
  res.setHeader('content-type', 'application/json')
  res.end('{"hello":"world"}')
})

router.on('GET', '/user/:id', (_req, res, params) => {
  res.setHeader('content-type', 'application/json')
  res.end('{"id":"' + params['id'] + '"}')
})

router.on('GET', '/files/*', (_req, res, params) => {
  res.end('splat:' + params['*'])
})

router.on('GET', '/v', { version: '1.0.0' }, (_req, res) => {
  res.end('v1')
})
router.on('GET', '/v', { version: '2.0.0' }, (_req, res) => {
  res.end('v2')
})

// exercise the non-lookup surface under compiled semantics
router.register({
  method: 'PUT',
  path: '/reg/:k',
  handler: (_req, res, params) => {
    res.end('reg:' + params['k'])
  },
})
router.on('DELETE', '/gone', (_req, res) => {
  res.end('gone')
})
router.off('DELETE', '/gone')
router.defaultRoute = (_req, res) => {
  res.statusCode = 404
  res.end('no-route')
}

const hit = router.find('GET', '/user/7')
console.log('find hit:', hit === null ? 'null' : 'handler')
const miss = router.find('GET', '/v?x=1', { version: '9.9.9', host: null })
console.log('find version-miss:', miss === null ? 'null' : 'handler')
console.log('allowed:', router.allowedMethods('/json').join(','))
console.log(router.prettyPrint())

const srv = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
  router.lookup(req, res)
})
srv.listen(3011)
