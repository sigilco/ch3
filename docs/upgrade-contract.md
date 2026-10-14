# Upgrade dispatch contract

Status: draft for 0.x. This is the seam between `packages/router/src/upgrade.ts` (`UpgradeDispatch`) and protocol packages that take over a connection after an HTTP `Upgrade` request, such as `@chttp/ws`. It is independent of `docs/route-contract.md`, which stays frozen.

## The seam in one paragraph

`app.withUpgrade(u)` registers an `UpgradeDispatch`. `app.serve()` attaches an `"upgrade"` listener to the server only when one is registered, so apps that never call `withUpgrade` keep node's default behaviour. Custom servers wire the same listener with `server.on("upgrade", app.upgradeHandler())`.

## Module shape

```ts
import { UpgradeDispatch } from '@chttp/router'
import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'

// Subclass, do not emit an object literal: a function value inside a
// record fences every call on it under scriptc. Class instances with
// methods compile cleanly.
export class WsRouter extends UpgradeDispatch {
  upgrade(req: IncomingMessage, socket: Socket, head: Buffer): boolean {
    // match req.url, run the handshake, take over the socket
    return false
  }
}
```

Wiring:

```ts
const app = createRouter()
app.withUpgrade(new WsRouter())
app.serve({ port: 3000 })

// custom server
const server = http.createServer(app.handler())
server.on('upgrade', app.upgradeHandler())
```

## Typing

The socket parameter is annotated `Socket` from `node:net`, with named imports. The `stream.Duplex` annotation that `@types/node` uses for the listener is rejected by scriptc at the type level (`No overload matches this call`), while `Socket` and `head: Buffer` compile at 100% static (see `bench/scriptc-evidence/frontend-probes-2026-10-14.txt`, case 4).

## Dispatch semantics

1. `withUpgrade` may be called at most once effectively: a later call replaces the earlier one (last wins).
1. The listener runs once per upgrade request, before any other work. The HTTP route table is not consulted; upgrade requests never reach `handler()`.
1. Return `true` when the upgrade is handled. The implementation owns the socket from that point: it must write the handshake response (or an error response) and eventually end or destroy the socket. The runtime does not touch it again.
1. Return `false` when the request is not recognized. Before returning `false` the implementation must not have written to or listened on the socket. The runtime then calls `socket.destroy()`, which matches node's behaviour when no `"upgrade"` listener exists.
1. `head` is the first bytes already read after the HTTP headers. Implementations must treat it as the start of the post-upgrade stream.
1. `upgradeHandler()` with nothing registered destroys every socket it receives.
1. Thrown errors are not caught by the runtime. Implementations should answer protocol errors themselves and return `true`.

## Surface exported for protocol packages

- `UpgradeDispatch` (class, from `@chttp/router`).
- `App.withUpgrade`, `App.upgradeHandler`.

Route matching helpers (`matchPath`, `RouteNode`) are intentionally not exported. Protocol packages that need path matching should carry their own small trie.
