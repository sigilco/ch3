# logging-file-audit

File based audit logging with a middleware that records every request and a few explicit audit events. One app, two sinks behind a plain function seam (`Audit` in `src/app.ts`).

| Mode | Entry | Sink |
| --- | --- | --- |
| ELF and node | `src/main.ts` | `fs.appendFileSync` in `src/audit.ts`, fully subset-native |
| node only | `src/main.node.ts` | LogTape `configureSync()` with the blocking `@logtape/file` sink |

LogTape core does not compile under scriptc today (`scriptc coverage` reports SC1016, a circular import in `context.js`, plus several unlowered forms in `configureInternal`), so the ELF entry does not use it. Messages are plain strings in both modes.

```sh
pnpm --filter @chttp/val build && pnpm --filter @chttp/router build   # once
pnpm --filter chttp-example-logging-file-audit test
cd examples/integrations/logging-file-audit
scriptc coverage src/main.ts      # 100% static
pnpm build && ./app audit.log     # ELF
pnpm start:node                   # node, appendFileSync sink
node --experimental-strip-types src/main.node.ts audit.log   # node, LogTape sink
```

The node LogTape sink buffers and flushes asynchronously, so a hard kill right after a request can lose the last line.
