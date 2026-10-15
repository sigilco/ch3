# Deploy

Pick one of three ways to ship a chttp app.

| Option                  | Ships                       | Image or artifact | Cold start |
| ----------------------- | --------------------------- | ----------------- | ---------- |
| Docker (`FROM scratch`) | one static binary           | 1.24 MB           | ~3 ms      |
| Binary only             | one static binary           | ~1.2 MB           | ~3 ms      |
| Node                    | your JS plus `node_modules` | node runtime      | 83 ms      |

## Docker

Copy [`examples/deploy-docker/Dockerfile`](https://github.com/sigilco/chttp/blob/main/examples/deploy-docker/Dockerfile) next to your app. It builds the binary in an alpine stage and copies it into `scratch`.

```sh
docker build -t my-app .
docker run --rm -p 8080:8080 my-app
```

The image has no shell, so debug with a different base if you need one.

## Binary only

Build, copy the file, run it. No runtime needed on the host.

```sh
scriptc build src/main.ts -o app --strip
./app
```

scriptc cannot cross-compile (no `--target`), so build on the OS and architecture you deploy to. For a linux server, build in CI on linux or inside an alpine container. An alpine build is fully static (musl), so it runs on any linux of the same architecture.

## Node

No build step. Deploy the JS like any node service:

```sh
node app.js
```

Use this when you need npm packages outside the scriptc subset. See [Run targets](targets.md).

## Web Standards adapter

The canonical entry is `app.fetch(req: Request) → Promise<Response>`. The same `createRouter()` symbol works on Cloudflare Workers, Deno Deploy, Bun, Vercel Edge, Netlify Edge, Supabase, and as a Service Worker. `app.handler()` is a thin Node adapter around `fetch()` for `node:http` users.

```ts
import { createRouter } from "@chttp/router";

const app = createRouter();
app.get("/user/:id", (c) => c.json({ id: c.req.param("id") }));

// Cloudflare Workers / Deno Deploy / Bun / Vercel Edge / Service Worker
export default {
  async fetch(req: Request, env: unknown, ctx: unknown): Promise<Response> {
    return app.fetch(req, env, ctx);
  },
};
```

Both surfaces compile to a native ELF via `scriptc build` (the `chttp-fetch` gate stays at 100% static coverage). Recipes for the two most common targets:

- [`examples/integrations/cloudflare-workers/`](../examples/integrations/cloudflare-workers/) — `wrangler dev` / `wrangler deploy`, `app.fetch` as the Workerd fetch handler.
- [`examples/integrations/aws-lambda/`](../examples/integrations/aws-lambda/) — APIGW v2 / Lambda URL bridge (`provided.al2023` ELF or Node runtime).
