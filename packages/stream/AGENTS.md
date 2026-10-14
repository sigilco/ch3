# stream AGENTS.md

`@chttp/stream` is SSE and chunked text streaming for `@chttp/router`, authored in the scriptc compilable subset. Same subset rules as `packages/router/src` (see root AGENTS.md), plus what this package learned:

- Depends only on `@chttp/router` (peer, workspace devDependency). It imports `Ctx` as a type from `@chttp/router/src/index.ts`; slices never import each other.
- Helpers are free functions taking `Ctx` (`streamSSE`, `streamText`). They `writeHead`, `flushHeaders` and set `c.sent = true` before returning `fn(stream)`; a settled handler that wrote nothing would otherwise get a 500. A promise returned by `fn` flows into the router's `settleChain`.
- Strategies are subclasses (`ChunkStream` > `SSEStream`, `TextStream`), never records of functions.
- Use `s.charAt(i)`, never `s[i]` (SC1090). Named imports from `node:http` only. Guard `T | undefined` explicitly (`x !== null && x !== undefined`).
- `scriptc 0.3.1` has no backpressure: `write()` result, `"drain"`, `writableLength` and write callbacks are all refused. The pending-bytes cap is therefore a window (`maxPending` bytes per `windowMs`), not true queue depth. Marked `scriptc>=X` in the source for replacement once upstream U6 lands.
- A `Ctx` parameter only lowers when a call site gives it a concrete instance, so `scriptc coverage` on `src/index.ts` alone reports unreached code. The gate is `scriptc coverage bench/apps/chttp-stream.ts`, which must stay 100% static.
- `pnpm --filter @chttp/stream test` runs the node:test suite against the tsc build with real HTTP round-trips. The compiled path is smoked by building `examples/sse-clock` and `curl -N` (events at the interval; the interval must stop after disconnect).
