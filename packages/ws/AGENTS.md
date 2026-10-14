# ws AGENTS.md

`@chttp/ws` is the WebSocket router on the `@chttp/router` upgrade seam (`docs/upgrade-contract.md`), authored in the scriptc compilable subset. Same subset rules as `packages/router/src` (root `AGENTS.md`), plus what this package learned:

- Depends on `@chttp/router` only. `WsRouter extends UpgradeDispatch`; the router does not export its trie, so `matchPattern` in `src/index.ts` is a small own exact + `:param` matcher.
- Handlers are `WsHandler` subclasses held in parallel arrays (`_pats`, `_hs`). Never a record or array of functions.
- The frame parser (`src/frame.ts`) is non-recursive: `feed()` appends, `next()` extracts one frame and returns `P_NEED | P_FRAME | P_ERROR`; the connection loops. Keep it free of closures and events.
- Fields that scriptc must type are public (underscore prefix by convention, no `private`): a `private` member is erased from the `.d.ts`, and the JS dist loses its annotation.
- Pass `this` through a `const self: WsConn = this` local when handing it to a user subclass method.
- Use `s.charAt(i)` not `s[i]`; guard `T | undefined` explicitly; named imports only; `Socket` (not `Duplex`) for the upgrade socket.
- Subclassing a package class from a user program only lowers when the whole graph is program code (see `docs/websocket.md`, "Compiling to a native binary"). `examples/ws-echo/scripts/vendor.mjs` is the supported layout.
- No permessage-deflate. UTF-8 validity is checked by a decode/encode round trip. Autobahn conformance is not run yet (TODO in `docs/websocket.md`).

## Gates

- `pnpm --filter @chttp/ws test`: framing unit tests (`test/frame.test.js`) and a raw `node:net` client against a real server (`test/ws.test.js`).
- `scriptc coverage` on `examples/ws-echo/src/main.ts` after `pnpm --filter chttp-example-ws-echo vendor` must stay 100% static.
- ELF smoke: build the example, run it, drive it with the `ws` library from a scratch directory (never a project dependency).
