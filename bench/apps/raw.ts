// Raw node:http baseline — authored inside the scriptc subset so the SAME file
// serves under node 24, bun (node:http compat is not used for the bun cell;
// see raw-bun.ts), and `scriptc build` (static ELF).
// Subset rules honored: import * as, sync handlers, plain records, indexed
// loops, res.end() as statement, body via req.on('data') + join, no regex,
// no ?., no for..in, no async.

import * as http from 'node:http'

const JSON_BODY = '{"hello":"world"}'
const OK_BODY = '{"ok":true}'

// ---- 100-route mixed table: 60 static / 30 param / 10 wildcard ----
const STATIC_SET: { [k: string]: number } = {}
const PARAM_SET: { [k: string]: number } = {}
const WILD_SET: { [k: string]: number } = {}
for (let i = 0; i < 60; i++) STATIC_SET['/m/s' + i + '/detail'] = 1
for (let i = 0; i < 30; i++) PARAM_SET['p' + i] = 1
for (let i = 0; i < 10; i++) WILD_SET['w' + i] = 1

function send(res: http.ServerResponse, status: number, ctype: string, body: string): void {
  res.statusCode = status
  res.setHeader('content-type', ctype)
  res.setHeader('content-length', String(body.length))
  res.end(body)
}

function route(url: string, method: string, body: string, res: http.ServerResponse): void {
  if (method === 'GET') {
    if (url === '/json') { send(res, 200, 'application/json', JSON_BODY); return }
    if (url === '/deep/a/b/c/d/e') { send(res, 200, 'application/json', OK_BODY); return }
    if (url.length > 6 && url.slice(0, 6) === '/user/') {
      const id = url.slice(6)
      if (id.length > 0 && id.indexOf('/') < 0) {
        send(res, 200, 'application/json', '{"id":"' + id + '"}')
        return
      }
    }
    if (url.length > 7 && url.slice(0, 7) === '/files/') {
      send(res, 200, 'text/plain', url.slice(7))
      return
    }
    if (url.length > 3 && url.slice(0, 3) === '/m/') {
      if (STATIC_SET[url] === 1) { send(res, 200, 'application/json', OK_BODY); return }
      const rest = url.slice(3)
      const slash = rest.indexOf('/')
      if (slash > 0) {
        const seg = rest.slice(0, slash)
        const tail = rest.slice(slash + 1)
        if (tail.length > 0) {
          if (PARAM_SET[seg] === 1 && tail.indexOf('/') < 0) {
            send(res, 200, 'application/json', OK_BODY)
            return
          }
          if (WILD_SET[seg] === 1) {
            send(res, 200, 'application/json', OK_BODY)
            return
          }
        }
      }
    }
  } else if (method === 'POST') {
    if (url === '/echo') { send(res, 200, 'text/plain', body); return }
  }
  send(res, 404, 'text/plain', 'Not Found')
}

const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
  const method: string = req.method || ''
  const url: string = req.url || '/'
  if (method === 'POST') {
    const chunks: string[] = []
    req.on('data', (c: Buffer) => { chunks.push(c.toString()) })
    req.on('end', () => { route(url, method, chunks.join(''), res) })
  } else {
    route(url, method, '', res)
  }
})

server.listen(3000, () => {
  console.log('raw node:http listening on :3000')
})
