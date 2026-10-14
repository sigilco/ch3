// Server entry. Imports the same `app` from routes.chttp.ts that the
// typed client was emitted against, and serves it. Compiles to a
// native ELF via `scriptc build` — no node:http polyfill, no
// bundler, no Vite.
import { app } from "./routes.chttp.ts";

const port = Number(process.env.PORT ?? process.argv[2] ?? 3000);
app.serve({ port });
