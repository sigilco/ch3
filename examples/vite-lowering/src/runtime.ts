// Non-plugin path: plain runtime router, no generated dispatch involved.
import { app } from './routes.ch3.ts'

const port = process.argv.length > 2 ? Number(process.argv[2]) : 3000
app.serve({ port: port })
console.log('vite-lowering (runtime path) listening on :' + port)
