# backpressure

Load shedding as global middleware: at most N requests in flight, the rest get an immediate 503 with `Retry-After`. Declared oversize bodies get 413.

Run: `pnpm build && ./app`, then fire several `curl localhost:3000/slow` at once. Test: `pnpm test`.

Why shed instead of queue: a queue hides overload until memory or latency explodes. A fast 503 lets the client or load balancer retry elsewhere. Size `maxInflight` from the concurrency your slowest dependency can take.

The body check reads `Content-Length`. The router buffers `{ body: true }` routes before the chain runs, so also cap body size at your proxy for hard memory protection.

scriptc < 0.3.2 could not observe `write()` results, `drain` or `writableLength`, so per-connection output backpressure is a windowed byte cap, see `@chttp/stream` (`maxPending` per `windowMs`) in `docs/streaming.md`. On 0.3.2+ the window is augmented by a compiled `Writable` wrapper.
