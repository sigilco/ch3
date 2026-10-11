import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { extractModule } from '../src/extract.ts'
import { emitGenModule } from '../src/emit.ts'

const gen = (src: string): string =>
  emitGenModule(extractModule('/app/src/routes.ch3.ts', src), {
    importFrom: '@sigilco/ch3',
    modulePath: '/app/src/routes.ch3.ts',
  })

const SRC = `
import { createRouter } from '@sigilco/ch3'
export const app = createRouter()
app.get('/json', (c) => c.json({ hello: 'world' }))
app.get('/user/:id', (c) => c.json({ id: c.req.param('id') }))
app.get('/files/*', (c) => c.text(c.req.param('*') || ''))
app.post('/echo', (c) => c.text(c.req.body()))
`

describe('emitGenModule', () => {
  it('emits a full-shape route table and dispatch entry', () => {
    const g = gen(SRC)
    assert.match(g, /export const routeTable: Ch3RouteEntry\[\] = \[/)
    assert.match(g, /\{ method: "GET", path: "\/json", kind: "static", handlerIdx: 0, needsBody: false \}/)
    assert.match(g, /\{ method: "GET", path: "\/user\/:id", kind: "param", handlerIdx: 1, needsBody: false \}/)
    assert.match(g, /\{ method: "GET", path: "\/files\/\*", kind: "wildcard", handlerIdx: 2, needsBody: false \}/)
    assert.match(g, /\{ method: "POST", path: "\/echo", kind: "static", handlerIdx: 3, needsBody: true \}/)
    assert.match(g, /export function dispatch\(req: IncomingMessage, res: ServerResponse\): boolean/)
    assert.match(g, /export function bindApp\(a: App\): void/)
    assert.match(g, /import type \{ App \} from "@sigilco\/ch3"/)
    // no value imports — the module must stay lowerable under scriptc
    assert.doesNotMatch(g, /import \{ Ctx, ReqView \}/)
  })

  it('emits a no-Ctx static runner for literal sends', () => {
    const g = gen(SRC)
    assert.match(g, /function run0\(req: IncomingMessage, res: ServerResponse\): void/)
    assert.match(g, /res\.end\("\{\\"hello\\":\\"world\\"\}"\)/)
    assert.match(g, /res\.setHeader\("content-length", "17"\)/)
  })

  it('emits pm extraction for param routes and a tail loop for wildcards', () => {
    const g = gen(SRC)
    assert.match(g, /\["id", dec\(segs\[2\]\)\]/)
    assert.match(g, /for \(let j = 2; j < segs\.length; j \+= 1\)/)
    assert.match(g, /\["\*", dec\(t\)\]/)
  })

  it('delegates ctx routes to App._run with their fns index', () => {
    const g = gen(SRC)
    // run3 = POST /echo ctx runner — body buffering lives inside App._run
    const run3 = g.slice(g.indexOf('function run3'))
    assert.match(run3, /_box\[0\]\._run\(3, req, res, pm, qs, path, m\)/)
    const run1 = g.slice(g.indexOf('function run1'), g.indexOf('function run2'))
    assert.match(run1, /_box\[0\]\._run\(1, req, res, pm, qs, path, m\)/)
    assert.doesNotMatch(g, /req\.on\("data"/)
  })

  it('adds a HEAD section serving GET routes', () => {
    const g = gen(SRC)
    assert.match(g, /if \(m === "HEAD"\)/)
    const head = g.slice(g.indexOf('if (m === "HEAD")'), g.indexOf('if (m === "POST")'))
    assert.match(head, /segs\[1\] === "json"/)
  })

  it('sorts checks by path precedence (static < param < wildcard)', () => {
    const g = gen(`
import { createRouter } from '@sigilco/ch3'
export const app = createRouter()
app.get('/a/*', (c) => c.text('w'))
app.get('/a/b', (c) => c.text('s'))
app.get('/a/:x', (c) => c.text(c.req.param('x') || ''))
`)
    const sect = g.slice(g.indexOf('if (m === "GET")'))
    const iB = sect.indexOf('segs[2] === "b"')
    const iX = sect.indexOf('dec(segs[2])')
    const iW = sect.indexOf('segs.length >= 3')
    assert.ok(iB >= 0 && iX > iB && iW > iX, 'expected static then param then wildcard')
  })

  it('puts *-method routes in every method section and the fallthrough', () => {
    const g = gen(`
import { createRouter } from '@sigilco/ch3'
export const app = createRouter()
app.all('/any', (c) => c.text('any'))
app.get('/g', (c) => c.text('g'))
`)
    const sect = g.slice(g.indexOf('if (m === "GET")'), g.indexOf('export function') === -1 ? g.length : undefined)
    assert.ok(g.indexOf('if (m === "GET")') < g.lastIndexOf('segs[1] === "any"'))
    // fallthrough check outside the section
    const tail = g.slice(g.lastIndexOf('segs[1] === "any"'))
    assert.match(tail, /run\d\(req, res\)/)
  })

  it('emits a stub when the router is not exported', () => {
    const g = gen(`
import { createRouter } from '@sigilco/ch3'
const app = createRouter()
app.get('/a', (c) => c.text('a'))
`)
    assert.match(g, /export const routeTable: Ch3RouteEntry\[\] = \[\]/)
    assert.match(g, /return false/)
    assert.doesNotMatch(g, /import app/)
  })
})
