# prometheus-metrics

A request counter (`http_requests_total{method,status}`) and a latency histogram (`http_request_duration_seconds`) recorded by a global middleware and served on `GET /metrics`.

| Mode | Entry | Implementation |
| --- | --- | --- |
| ELF and node | `src/main.ts` | Hand rolled exposition in `src/metrics.ts` (`# HELP`, `# TYPE`, labelled samples, cumulative histogram buckets, label escaping), fully subset-native |
| node only | `src/main.node.ts` | `prom-client` Registry, Counter and Histogram with an async `/metrics` handler |

`prom-client` does not compile under scriptc (`class Grouper extends Map`), which is why the ELF entry has its own module. Metrics are plain records and parallel arrays: no `Map`, no classes, no function valued records.

Notes:

- The global middleware only wraps matched routes, so unmatched 404s are not counted.
- Labels are method and status only, to keep cardinality bounded. Route templates are not exposed to middleware.
- Durations come from `Date.now()`, so sub millisecond requests observe `0`.

```sh
pnpm --filter @chttp/val build && pnpm --filter @chttp/router build   # once
pnpm --filter chttp-example-prometheus-metrics test
cd examples/integrations/prometheus-metrics
scriptc coverage src/main.ts      # 100% static
pnpm build && ./app               # ELF on :3000
pnpm start:node                   # node with prom-client
curl localhost:3000/metrics
```
