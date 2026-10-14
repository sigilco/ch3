// Non-plugin path: plain runtime router, no generated dispatch involved.
import { app } from './routes.chttp.ts'

const port = process.argv.length > 2 ? Number(process.argv[2]) : 3100
app.serve({ port: port })
console.log('vite-app (runtime path) listening on :' + port)
