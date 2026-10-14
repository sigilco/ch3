# otlp-traces

A server span per request, batched and exported to an OTLP/HTTP collector (`POST /v1/traces`, JSON encoding) by a small exporter built on `node:http`. Incoming W3C `traceparent` headers are honoured, so spans join the caller's trace.

One source runs as ELF and on node: `src/otlp.ts` (exporter, ids, payload), `src/app.ts` (tracing middleware plus routes), `src/main.ts` (entry).

`@logtape/otel` and the OpenTelemetry JS SDK are not usable under scriptc (dynamic `import()`), so the exporter is hand written. The `node:http` client, `Math.random` ids and `JSON.stringify` all lower fine.

Notes:

- Batches flush when `batchSize` spans are pending (5 in `main.ts`). There is no timer, so a quiet service holds its last partial batch until more traffic arrives.
- Export is fire and forget; a failed POST logs one line and never affects the response.
- Only matched routes are traced (global middleware does not wrap 404s).
- Span names use the concrete path, not the route template, so cardinality is the caller's problem.

```sh
pnpm --filter @chttp/val build && pnpm --filter @chttp/router build   # once
pnpm --filter chttp-example-otlp-traces test
cd examples/integrations/otlp-traces
scriptc coverage src/main.ts      # 100% static
pnpm build && ./app 4318          # ELF on :3000, collector on :4318
pnpm start:node
```
