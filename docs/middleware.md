# Middleware

Middleware is `(c, next) => void | Promise<void>` — sync or async. `next()` returns the tail's result, so `await next()` in an async middleware waits for the rest of the chain to settle.

```ts
app.use((c, next) => {
  c.header("x-start", Date.now().toString());
  next();
});
```

Middleware applies to routes registered **after** it (snapshot semantics).

## Body

`c.req.body()` is synchronous because dispatch pre-buffers the request body (`data`/`end` concat) for POST/PUT/PATCH/DELETE before invoking the chain — on routes that declared `{ body: true }`. Other methods dispatch immediately.

## Serving static files

Do not hand-roll a static handler: reading files as utf8 corrupts binaries, and the traversal, caching and `index.html` details are easy to get wrong. Use [`@chttp/static`](static.md), which serves bytes through `c.bytes()`, handles ETag/304, HEAD, precompressed siblings and an opt-in SPA fallback, and compiles into the ELF.

Next: [Errors](errors.md).
