# @ch3/unplugin

Build-time route lowering for [ch3](https://ch3js.pages.dev/), via [unplugin](https://unplugin.unjs.io). Works with Vite, Rollup, Webpack, esbuild, and Rolldown.

The plugin statically reads your `*.ch3.ts` route registrations and emits a specialized dispatch module, so requests skip the runtime trie walk. Routes it cannot prove bail to the runtime path with a warning; it never emits a route it is unsure about.

## Install

```sh
npm i -D @ch3/unplugin
```

## Usage

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { ch3Plugin } from "@ch3/unplugin";

export default defineConfig({
  plugins: [ch3Plugin.vite()],
});
```

```ts
// src/main.ts
import { app } from "./routes.ch3.ts";
import { CompiledRoutes } from "./.ch3/routes.gen.ts";

app.withDispatch(new CompiledRoutes(app));
app.serve({ port: 3000 });
```

## Docs

Full reference, emit contract, bail semantics, and the scriptc compilation tiers live in [PLUGIN.md](./PLUGIN.md) and at <https://ch3js.pages.dev/unplugin>.

## License

Apache-2.0
