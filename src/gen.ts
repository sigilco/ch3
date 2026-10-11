// Generated-dispatch contract — the stable seam between @sigilco/ch3 and
// build-time code generators (the Vite/unplugin transform). Spec:
// docs/route-contract.md.
//
// Emitters generate `class X extends GenDispatch { dispatch(req,res){…} }`
// and register `app.withDispatch(new X())`. Subclass method override is
// verified to dispatch correctly under both node and scriptc ELF builds.
import type { IncomingMessage, ServerResponse } from 'node:http'

export type DispatchFn = (req: IncomingMessage, res: ServerResponse) => boolean

export class GenDispatch {
  dispatch(_req: IncomingMessage, _res: ServerResponse): boolean {
    return false
  }
}
