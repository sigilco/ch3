---
"@chttp/router": minor
---

Add the Web Standards `app.fetch(req, env?, ctx?) → Promise<Response>` surface. `app.handler()` is now a thin Node adapter around it. New Ctx additions: `c.set` / `c.get` for request-scoped vars, `c.req.raw` exposing the inbound `Request`, and `c.header(name, value, { append: true })` for multi-value headers. New `App.use(path, ...mw)` overload for Hono-style path-scoped middleware. The `ResponseSink` abstraction in `packages/router/src/sink.ts` is the single seam that lets the same chain produce either a `ServerResponse` write (Node) or a Web `Response` finalization (Workers, Deno Deploy, Bun, Vercel Edge, Netlify Edge, Supabase, Service Worker). Both surfaces compile to a native ELF; the `bench/apps/chttp-fetch.ts` gate is the new scriptc subset check.

This commit also includes the SC9001 fix (see `fix-sc9001.md`): `ReqView` now materializes `raw.headers` and `raw.headersDistinct` into Record-typed locals at construction so `header()` reads from Record locals instead of class-typed fields on `IncomingMessage`. The change is needed on the app.fetch commit because the partial fix for `headers` was already there (commit `0305d62`); the `headersDistinct` arm was left in the prior state and fences scriptc 0.3.x with "live dynFrom of unsupported type httpReq".
