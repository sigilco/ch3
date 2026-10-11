// Compiled-path entry: consult the generated dispatch first, then fall
// back to the runtime router for anything the plugin bailed on.
import * as http from 'node:http'
import { app } from './routes.ch3.ts'
import { bindApp, dispatch } from './.ch3/routes.gen.ts'

const port = process.argv.length > 2 ? Number(process.argv[2]) : 3100

bindApp(app)

http
  .createServer(function (req, res): void {
    if (!dispatch(req, res)) {
      app._dispatch(req, res)
    }
  })
  .listen(port)

console.log('vite-app (compiled dispatch) listening on :' + port)
