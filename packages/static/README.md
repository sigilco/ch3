# @chttp/static

Static file serving for [chttp](https://github.com/sigilco/chttp), authored in the scriptc compilable subset so it compiles into the same native binary. Serves from disk or from embedded bytes, with ETag/304, HEAD, precompressed `.br`/`.gz` siblings, immutable caching for hashed filenames and an opt-in SPA fallback.

```ts
import { createRouter } from "@chttp/router";
import { DiskAssets, serveStatic } from "@chttp/static";

const app = createRouter();
serveStatic(app, "/", new DiskAssets("./web/dist"), { spa: true });
app.serve({ port: 3000 });
```

See the [static files guide](https://github.com/sigilco/chttp/blob/main/docs/static.md).
