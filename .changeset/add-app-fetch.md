---
"@chttp/router": minor
---

Add the Web Standards `app.fetch(req, env?, ctx?) → Promise<Response>` surface. `app.handler()` is now a thin Node adapter around it. New Ctx additions: `c.set` / `c.get` for request-scoped vars, `c.req.raw` exposing the inbound `Request`, and `c.header(name, value, { append: true })` for multi-value headers. New `App.use(path, ...mw)` overload for Hono-style path-scoped middleware. The `ResponseSink` abstraction in `packages/router/src/sink.ts` is the single seam that lets the same chain produce either a `ServerResponse` write (Node) or a Web `Response` finalization (Workers, Deno Deploy, Bun, Vercel Edge, Netlify Edge, Supabase, Service Worker). Both surfaces compile to a native ELF; the `bench/apps/chttp-fetch.ts` gate is the new scriptc subset check.
