# hono-middleware

Tracks `@chttp/router` Hono-middleware compat. **Not yet functional** —
see the limitation below.

## What this proves so far

- `app.fetch(req, env, ctx): Promise<Response>` exists and is callable
  through the router's normal Node test harness.
- `c.req.url` is populated on the fetch path so middlewares that read
  it (e.g. hono/logger's inbound `<-- METHOD path` line) get a real
  value.
- `app.use('*', mw)` and `app.use('/prefix/*', ...mws)` honor Hono's
  path-scoped middleware shape — see the corresponding router unit
  tests in `packages/router/test/router.test.js`.

The single active test (`hono/logger prints the inbound <-- line on a
200 response`) covers all three. Two more tests sit behind `test.skip`
waiting on the follow-up below.

## Limitation: `c.res.status` on the fetch path

`hono/logger` (and any other middleware that wants to read the live
response status after `await next()`) does:

```ts
await next()
log(`--> ${method} ${path} ${c.res.status} ${elapsed}ms`)
```

On chttp:

- **Node path** — `c.res` returns the raw `ServerResponse`, which
  exposes `statusCode`, not `status`. hono/logger throws.
- **Fetch path** — `c.res` is `null`. hono/logger throws.

So only the inbound `<-- ...` line ever prints; the outbound
`--> ... status elapsed` line throws, the response has already been
written by the time the throw surfaces, and the captured stdout ends
with just the inbound.

The follow-up is one of:

1. **Bridge `c.res` on the fetch path** to a small Response-shaped
   record (just `{ status, headers }`) that scriptc can lower. This
   is blocked on subset research — `Response` as a class field is
   SC1090, and `ServerResponse | { status, headers }` is SC2009.
2. **Report a scriptc issue** if Hono's typing is actually correct and
   the chttp type-side just looks wrong to scriptc. The chttp side
   could be defensible: `c.res` is documented as a Node-shaped escape
   hatch, and Hono's read of `c.res.status` is a Hono idiom rather
   than a Web Standards contract.

Once one of those lands, flip the two `test.skip` entries in
`test/logger.test.ts` and the integration is fully tracked.

## Running

```sh
pnpm --filter chttp-example-hono-middleware test
```
