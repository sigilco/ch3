# static AGENTS.md

`@chttp/static` is static asset serving in the scriptc compilable subset. It depends on `@chttp/router` only (peer plus workspace dev dependency); never import another slice. Same subset rules as `packages/router/src` (see root AGENTS.md), plus what authoring this package taught:

- Ports are base classes (`AssetSource`), strategies are subclasses (`DiskAssets`, `EmbeddedAssets`). The unplugin `assets` slice will emit an `EmbeddedAssets` subclass that calls `load(records)` with a baked array of `EmbedRecord`. JSON-baked data is always an array of records, never a path-keyed object.
- Reading a missing key from a string-keyed record throws in a native binary (`record has no key`). Test presence with `key in record`, then index. Prefix keys (`"/" + path`, `"." + ext`) so `constructor` and friends never hit the prototype.
- Use `s.charAt(i)`, never `s[i]`; named imports only (`import { createHash } from "node:crypto"`); guard `T | undefined` with an explicit check; `| null` unions only.
- `httpDate()` is hand-rolled from `getUTC*` (byte-identical to `toUTCString`). It carries a `scriptc>=X: replace with toUTCString` marker; grep for it when bumping scriptc.
- Handlers are closures over a `StaticServer` instance (`(c) => srv.handle(c)`), which keeps state in class fields.
- `scriptc coverage packages/static/gate.ts` is the compile gate. The package itself must be 100% static; the two deferred sites it reports today are in `@chttp/router`'s dist (upgrade listener under npm compilation), not here. Build it with `scriptc build gate.ts -o app` and run `./app <port> <dir>` to curl-check a binary asset against `shasum -a 256`.
- `pnpm --filter @chttp/static test` builds with tsc and runs node:test against real `http` servers (traversal, 304, HEAD, sha256, SPA fallback, `/api` JSON 404).
- Out of scope here: `IsrCache` (later phase), range requests, anything in `packages/unplugin`.
