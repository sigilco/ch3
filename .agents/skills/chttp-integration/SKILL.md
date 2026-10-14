---
name: chttp-integration
description: Integrating chttp routing and build tooling into an existing TypeScript project, including wiring the vite/unplugin route-lowering pipeline, choosing between a JS dist and a native ELF build, and consuming emitted artifacts like routes.gen.ts. Use when adding @chttp/router or @chttp/unplugin to a project that already has its own build setup. Triggers include "add chttp to", "chttp plugin", "chttpPlugin", "routes.gen", "withDispatch", or route-lowering/unplugin wiring questions.
---

# Integrating chttp into an existing project

Canonical references: `docs/unplugin.md` (plugin modes and usage) and
`packages/unplugin/PLUGIN.md` (full option reference). This file is a
condensed decision index; when it disagrees with those, those win.

## When to use

Adding chttp routing or build tooling to an existing TS project: choosing the
pipeline tier, wiring vite config, marking route modules, and consuming what
the plugin emits. For authoring subset-safe handler code once integrated, see
the `chttp-app-dev` skill.

## Decision tree

- **Want a native ELF?** You need `unplugin-scriptc` composed with
  `@chttp/unplugin`, and chttp must be program code (vendored source or
  workspace layout), not an npm dependency in the normal sense. See the
  "Compiling with scriptc" section of `packages/unplugin/PLUGIN.md`.
- **Just want route lowering on node?** Plain `@chttp/unplugin` with any
  bundler it supports (vite verified by fixture; rollup/webpack/esbuild via
  the unplugin factory). No scriptc anywhere in the pipeline.
- **Neither?** `@chttp/router` alone needs no plugin at all.

## Vite config

```ts
// vite.config.ts
import { chttpPlugin } from "@chttp/unplugin";
// ELF only:
import { scriptcPlugin } from "unplugin-scriptc";

export default defineConfig({
  plugins: [
    chttpPlugin.vite(),
    // ELF only:
    scriptcPlugin.vite({ entry: "src/main.ts", out: "dist/app" }),
  ],
});
```

Plugin options (include globs, root, importFrom, appExport, imports, parser)
are documented in `packages/unplugin/PLUGIN.md`.

## Route module conventions

Mark route-registration modules with the `.chttp.ts` suffix (or override via
the `include` option; default `**/*.chttp.ts`, `**/*.chttp.js`):

```ts
// src/routes.chttp.ts
import { createRouter } from "@chttp/router";

export const app = createRouter();

app.get("/user/:id", (c) => c.json({ id: c.req.param("id") }));
app.post("/echo", (c) => c.text(c.req.body()), { body: true });
```

Routes the extractor cannot prove (non-literal paths, conditional
registration, cross-module mounts) stay on runtime dispatch with a build
warning: the plugin bails, it never guesses. A handler reading the body must
register `{ body: true }` or receives `''`.

## Emitted artifacts

- `.chttp/routes.gen.ts`: the dispatch module (always emitted for analyzed
  route modules). Never hand-edit; change the generator, not the artifact.
- `.chttp/routes.openapi.ts` and `.chttp/routes.client.ts`: planned
  side-channel artifacts (OpenAPI document, typed client). If present in
  your `@chttp/unplugin` version, they are plain TS, never imported by the
  runtime dispatch, and safe to ignore or consume from non-scriptc code.

## Wiring the dispatch

```ts
// src/main.ts
import { app } from "./routes.chttp.ts";
import { CompiledRoutes } from "./.chttp/routes.gen.ts";

app.withDispatch(new CompiledRoutes(app));
app.serve({ port: 3000 });
```

`app.serve()` tries the generated dispatch first; `false` declines to the
internal dispatch, which covers bails, `notFound`, and misses. The route
table on `app` stays the source of truth either way.

## Contract stamp mismatch

`app.withDispatch(d)` throws immediately if the gen module's
`ROUTE_CONTRACT_VERSION` stamp differs from the runtime's, naming both
versions. Fix: upgrade `@chttp/unplugin` to match `@chttp/router` and
regenerate `.chttp/*` (rebuild). Never edit the stamp by hand.

## Canonical references

- `docs/unplugin.md`: modes, usage, contract stamping
- `packages/unplugin/PLUGIN.md`: full option reference, scriptc composition
- `docs/route-contract.md`: the frozen emit seam
- `examples/vite-lowering` and `fixtures/vite-app`: working setups
