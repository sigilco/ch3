import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { extractModule } from '../src/extract.ts'
import { emitGenModule } from '../src/emit.ts'

const gen = (src: string): string =>
  emitGenModule(extractModule('/app/src/routes.ch3.ts', src), {
    importFrom: 'ch3',
    modulePath: '/app/src/routes.ch3.ts',
  })

const SRC = `
import { createRouter } from 'ch3'
export const app = createRouter()
app.get('/json', (c) => c.json({ hello: 'world' }))
app.get('/user/:id', (c) => c.json({ id: c.req.param('id') }))
app.get('/files/*', (c) => c.text(c.req.param('*') || ''))
app.post('/echo', (c) => c.text(c.req.body()), { body: true })
`

describe('emitGenModule', () => {
  it('emits the contract class, a full-shape route table, and dispatch', () => {
    const g = gen(SRC)
    assert.match(g, /export class CompiledRoutes extends GenDispatch/)
    assert.match(g, /constructor\(a: App\)/)
    assert.match(g, /dispatch\(req: IncomingMessage, res: ServerResponse\): boolean/)
    assert.match(g, /export const routeTable: Ch3RouteEntry\[\] = \[/)
    assert.match(g, /\{ method: "GET", path: "\/json", kind: "static", handlerIdx: 0, needsBody: false \}/)
    assert.match(g, /\{ method: "GET", path: "\/user\/:id", kind: "param", handlerIdx: 1, needsBody: false \}/)
    assert.match(g, /\{ method: "GET", path: "\/files\/\*", kind: "wildcard", handlerIdx: 2, needsBody: false \}/)
    assert.match(g, /\{ method: "POST", path: "\/echo", kind: "static", handlerIdx: 3, needsBody: true \}/)
    assert.match(g, /import \{ GenDispatch, ReqView, Ctx, _guard, _buffer, dec \} from "sigilco\/ch3"/)
    assert.match(g, /import type \{ App \} from "sigilco\/ch3"/)
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

  it('runs ctx routes through the contract surface with their chains index', () => {
    const g = gen(SRC)
    // run3 = POST /echo declared-body ctx runner
    const run3 = g.slice(g.indexOf('function run3'))
    assert.match(run3, /new ReqView\(req, qs, path\)/)
    assert.match(run3, /_buffer\(req, res, c, function \(\): void \{ a\._chains\[3\]\(c\) \}\)/)
    const run1 = g.slice(g.indexOf('function run1'), g.indexOf('function run2'))
    assert.match(run1, /_guard\(res, function \(\): void \{ a\._chains\[1\]\(c\) \}\)/)
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
import { createRouter } from 'ch3'
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
import { createRouter } from 'ch3'
export const app = createRouter()
app.all('/any', (c) => c.text('any'))
app.get('/g', (c) => c.text('g'))
`)
    assert.ok(g.indexOf('if (m === "GET")') < g.lastIndexOf('segs[1] === "any"'))
    const tail = g.slice(g.lastIndexOf('segs[1] === "any"'))
    assert.match(tail, /run\d\(req, res\)/)
  })

  it('keeps a runtime method check only for declared-body * routes', () => {
    const g = gen(`
import { createRouter } from 'ch3'
export const app = createRouter()
app.all('/u', (c) => c.text(c.req.body()), { body: true })
`)
    assert.match(g, /if \(m === "POST" \|\| m === "PUT" \|\| m === "PATCH" \|\| m === "DELETE"\)/)
    const g2 = gen(SRC)
    // GET routes never buffer even when declared — the flag is ignored
    assert.doesNotMatch(
      g2.slice(g2.indexOf('function run1'), g2.indexOf('function run2')),
      /_buffer/
    )
  })

  it('emits a stub class when the router is not exported', () => {
    const g = gen(`
import { createRouter } from 'ch3'
const app = createRouter()
app.get('/a', (c) => c.text('a'))
`)
    assert.match(g, /export class CompiledRoutes extends GenDispatch/)
    assert.match(g, /export const routeTable: Ch3RouteEntry\[\] = \[\]/)
    assert.match(g, /return false/)
  })
})
