---
"@chttp/router": patch
---

Fix a runtime failure of the compiled ELF under scriptc 0.3.x (upstream: vercel-labs/scriptc#963). Two root causes, both removed from the router surface.

First, generic classes lower to methodless instances: `Ctx<P>` and `ReqView<P>` compile to objects whose fields read but whose every method call throws (`c.json is not a function` on 0.3.1/0.3.2, `rv._setBody is not a function` on 0.3.3). Second, class-typed unions are unrepresentable: `ResponseSink | ServerResponse` and `IncomingMessage | NodeReqStub` cannot sit in constructor or parameter positions, and `typeof x.method === "function"` discrimination demotes method names into `prototypeMethodAccesses`, which removes the fallback entirely.

The fix narrows the surface so the same source lowers to a working ELF:

- `Ctx`/`ReqView` become non-generic `CtxCore`/`ReqViewCore` classes; `interface Ctx<P> extends CtxCore` plus `const Ctx = CtxCore` aliases keep `new Ctx(...)`, `Ctx` annotations and `Ctx<'/path'>` working under tsc with no source change for users.
- The `Ctx` constructor, `_guard` and `_buffer` take a `ResponseSink` only; callers with a raw `ServerResponse` wrap it: `new Ctx(rv, new NodeResponseSink(res))`. `ROUTE_CONTRACT_VERSION` bumps 1→2 and the generated dispatch is regenerated to match.
- `ReqViewCore` takes `IncomingMessage | null` plus optional stub arguments; the `app.fetch` arm passes `null` instead of a record union. `c.req.raw` is now `IncomingMessage | null` (`null` on the fetch path).
- `ResponseSink` gains `nodeRes(): ServerResponse | null` for sink-flavor reads without casts.

ELF-verified under scriptc 0.3.3: `chttp.ts` and `chttp-fast.ts` serve real 200s (`/json`, `/user/42`, `POST /echo`, `/files`, `/missing` 404, `GET /echo` 405), and a fetch-surface probe (`_dispatchPrim` + `FetchResponseSink` + `toResponse()`) serves 200s including `c.set`/`c.get`, append headers and middleware.
