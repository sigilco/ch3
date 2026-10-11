// Compiled-path entry (docs/route-contract.md): the generated dispatch is
// registered once via withDispatch — app.serve/app.handler try it FIRST on
// every request, and a `false` return declines to the internal dispatch,
// which covers bailed routes, notFound, and misses.
import { app } from './routes.ch3.ts'
import { CompiledRoutes } from './.ch3/routes.gen.ts'

const port = process.argv.length > 2 ? Number(process.argv[2]) : 3100

app.withDispatch(new CompiledRoutes(app))
app.serve({ port: port })

console.log('vite-app (compiled dispatch) listening on :' + port)
