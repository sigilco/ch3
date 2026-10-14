# rate-limit

Per-client fixed window rate limiting as global middleware. Over the limit returns 429 with `Retry-After` and `RateLimit-*` headers.

Run: `pnpm build && ./app`, then `curl -i -H 'x-api-key: me' localhost:3000/` six times. Test: `pnpm test`.

Key the limiter on the header your proxy sets (`x-forwarded-for`), or on an API key. chttp does not expose the socket address on `c.req`.

Memory is bounded: keys hash into 1024 slots held in parallel arrays, so a flood of unique keys cannot grow the table. The trade-off is that a colliding key resets its neighbour's window (fails open). Raise `SLOTS` in `src/limiter.ts` for more distinct clients.

State is per process. Behind several instances, limit at the proxy or share state externally.
