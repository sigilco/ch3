// Upgrade dispatch seam. Spec: docs/upgrade-contract.md.
//
// Protocol packages (@chttp/ws) subclass UpgradeDispatch and register the
// instance with `app.withUpgrade(new X())`. Same shape as GenDispatch: a
// class with a method, never a record of functions, so scriptc keeps the
// call site statically lowered.
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";

export type UpgradeFn = (req: IncomingMessage, socket: Socket, head: Buffer) => boolean;

export class UpgradeDispatch {
  // true = the upgrade is handled (the implementation owns the socket from
  // here on). false = not recognized; the runtime destroys the socket.
  upgrade(_req: IncomingMessage, _socket: Socket, _head: Buffer): boolean {
    return false;
  }
}
