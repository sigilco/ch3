## Shared context — scriptc subset playbook (verified, do NOT re-derive)

`scriptc` 0.2.8 compiles TS/JS to a native ELF. Facts proven on 2026-10-11:
- The `--dynamic` QuickJS island has NO `createServer`/`node:http2`; native req/res handles cannot enter island code. **The only viable topology: everything compiles statically as program modules via `--npm-static <pkg>` or as authored source.**
- Build probe recipe: `scriptc build <app> --npm-static <pkg...> --optimization=speed -o bin/app` — `--dynamic` is needed only if the app deliberately uses island code.
- Deferred-site debugging: build WITHOUT `--dynamic` — fences throw named errors at the exact line (`SC#### at file:line`); with `--dynamic` they die with an opaque "runtime handle" TypeError.
- Fenced bare `require()` calls ARE catchable (`try { x = require('p') } catch {}`).

### Authoring rules that compile (the "scriptc subset")
1. Sync handlers only. `null`, never `undefined`, in unions/returns (`X | undefined` unrepresentable — SC3004).
2. Plain `({})` records; no `Object.create(null)`, `Object.freeze`, class-instances-as-dicts, or module-namespace values.
3. Indexed `for` loops only (no `for…in`/`for…of` on user objects — `for of` over arrays IS fine; `for…in`+`hasOwnProperty` is not). No `stack.pop()` in expression position — peek then pop.
4. `String(x)`/`Number(x)` coercion at function entry for params arriving `unknown`.
5. No `new Function`/`eval` anywhere on the shipped path (SC2020, unlowerable).
6. No `instanceof` against non-program classes; no `new.target`; no `URL.parse`/`URL.canParse` (use `try/catch new URL`); no object-shorthand/method-shorthand/module.exports-shorthand forms.
7. `import * as http from 'node:http'` style; `req.url`/`req.method` non-optional `string`.
8. No function values stored in route tables if the handler signature crosses 'any'-typed dispatch — store compiled dispatch or keep handler types concrete (`(req,res,params)=>void`).
9. Body read: `req.on('data',(c)=>buf+=c.toString())` + `req.on('end',...)` — `Buffer.concat`/`req.pipe` unlowered.
10. `.d.ts` for the package: concrete types, `| null` unions only, zero DOM symbols, no generics resolving to `unknown` at the boundary.
11. tsc-emit CJS boilerplate (`exports.X = void 0`, `__importStar`) is uncompileable — author plain ESM, let the bundler emit CJS if needed.

### Verified numbers for calibration (autocannon -c64 -d6, shared VM ±50% noise)
- scriptc/fmw-fork: ~60-92k rps (best 92.4k) · node/fmw-fork ~60-95k → **parity**
- scriptc/mini-router: 79.7k · node/hono 69k · node/fastify-class ~45-70k · bun/hono 94k
- Survey-VM (faster): baseline 109.7k, memoirist-fork 104.9k (3 patches), rou3-fork 95.6k (~10 patches)

### ch3 API contract (frozen sketch — implement/shim against THIS)
```ts
// @sigilco/ch3 — ESM-first, zero deps, subset-authored
import { createRouter } from '@sigilco/ch3'
const app = createRouter()
app.get('/json', (c) => c.json({ hello: 'world' }))        // c.json sets headers+res.end
app.get('/user/:id', (c) => c.json({ id: c.req.param('id') })) // params typed from path literal where feasible
app.post('/echo', (c) => c.text(c.req.body()))              // body() sync-collects req data → string
app.notFound((c) => c.status(404).text('not found'))
app.serve({ port: 3000 })   // sugar over node:http createServer(app.handler())
```
Context `c`: `c.req.param(name)`, `c.req.query(name|all)`, `c.req.header(name)`, `c.req.body()`; `c.json(obj)`, `c.text(s)`, `c.html(s)`, `c.status(n)`, `c.header(k,v)`, `c.redirect(url,code)`. Handlers are SYNC `(c) => void | c` — body() is the sync-collect abstraction over req 'data'/'end' (design may revise its exact shape; keep the sketch's semantics).

ATTACHMENT:"https://app.devin.ai/attachments/d6838a59-c4d7-46e7-8d3b-0406b22de98c/REPORT.md"
