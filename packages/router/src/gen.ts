// Generated-dispatch contract — the stable seam between chttp and
// build-time code generators (the Vite/unplugin transform). Spec:
// contracts/route-contract.md.
//
// Emitters generate `class X extends GenDispatch { dispatch(req,res){…} }`
// and register `app.withDispatch(new X())`. Subclass method override is
// verified to dispatch correctly under both node and scriptc ELF builds.
import type { IncomingMessage, ServerResponse } from "node:http";

export type DispatchFn = (req: IncomingMessage, res: ServerResponse) => boolean;

// Contract version (contracts/route-contract.md, Contract versioning). Bumped
// when the emit contract changes shape. Emitters stamp the same number
// into generated modules and App.withDispatch refuses a mismatch.
export const ROUTE_CONTRACT_VERSION = 2;

export class GenDispatch {
  // Stamp carried by every dispatch instance. GenDispatch subclasses that
  // predate stamping inherit the current version (accepted, backward
  // compat within this cycle); emitted modules assign their own stamped
  // value right after super(), and that value is what gets validated.
  ROUTE_CONTRACT_VERSION: number;

  constructor() {
    this.ROUTE_CONTRACT_VERSION = ROUTE_CONTRACT_VERSION;
  }

  dispatch(_req: IncomingMessage, _res: ServerResponse): boolean {
    return false;
  }
}
