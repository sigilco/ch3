// scriptc program-code smoke app — imports the core SOURCE directly (no
// package resolution), so `scriptc build test/smoke.ts` exercises eager
// instantiation of every class method (the SC0001-class fences that lazy
// --npm-static instantiation can hide). All runtime paths must stay
// subset-clean.
import { createRouter } from '../src/index.ts'

const app = createRouter()

app.get('/json', (c) => c.json({ hello: 'world' }))

app.get('/user/:id', (c) => c.json({ id: c.req.param('id') }))

const port = process.argv.length > 2 ? Number(process.argv[2]) : 3000
app.serve({ port: port })
console.log('ch3 smoke listening on :' + port)
