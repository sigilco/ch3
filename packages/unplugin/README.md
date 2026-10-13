# @ch3/unplugin

Build-time route lowering for [ch3](https://github.com/sigilco/ch3). Scans `*.ch3.ts` route modules at build start, extracts the literal route table, and emits a specialized dispatch module (`.ch3/routes.gen.ts`) so matching requests skip the runtime trie walk.

```ts
// vite.config.ts
import { ch3Plugin } from "@ch3/unplugin";

export default {
  plugins: [ch3Plugin.vite()],
};
```

```ts
// src/main.ts — register the generated dispatch once
import { app } from "./routes.ch3.ts";
import { CompiledRoutes } from "./.ch3/routes.gen.ts";

app.withDispatch(new CompiledRoutes(app));
app.serve({ port: 3000 });
```

ch3 itself is authored in the [scriptc](https://github.com/sigilco/scriptc) compilable subset and lowers to a native ELF on its own. This plugin is an elective optimization on top: it recovers the declarative route table from imperative `app.get()` / `app.use()` / `app.mount()` registrations, which a general compiler cannot see. Two output modes:

- Plain vite/rollup: the generated dispatch bundles into your JS dist.
- With [unplugin-scriptc](https://github.com/sigilco/unplugin-scriptc): the dispatch compiles to native code inside the ELF.

Routes the analyzer cannot prove literal stay on the runtime router with a build warning. It never emits a wrong route. The emitted module satisfies the frozen contract in [`docs/route-contract.md`](https://github.com/sigilco/ch3/blob/main/docs/route-contract.md) and carries a `ROUTE_CONTRACT_VERSION` stamp that `app.withDispatch()` validates at startup, so a stale generated file fails loudly instead of misbehaving.

## Options

| Option | Default | Purpose |
| --- | --- | --- |
| `include` | `["**/*.ch3.ts", "**/*.ch3.js"]` | Globs (relative to root) marking route-registration modules |
| `root` | vite config root, else `process.cwd()` | Project root to scan |
| `importFrom` | `"ch3"` | Import specifier emitted into the generated file |
| `appExport` | auto-detect | Exported binding carrying the router instance |
| `imports` | `["ch3"]` | Extra module specifiers treated as ch3 imports |
| `parser` | `"classic"` | `"tsgo"` routes extraction through the TypeScript 7 native compiler (`typescript/sync` nightly, experimental) |

## Install

```sh
pnpm add -D @ch3/unplugin
```

Peer dependency: `ch3`. The default parser uses the classic TypeScript API; the `tsgo` option requires a pinned `typescript@next` install and is experimental (measured slower than classic at parse-only workloads in `bench/RESULTS-plugin.md`, kept for re-evaluation as the native API stabilizes).

## Why source exports

The package ships TypeScript source (`files: ["src"]`, types point at `.ts`). Bundler plugins are build-time code, and scriptc compiles them as program code from source.

License: Apache-2.0. See [PLUGIN.md](https://github.com/sigilco/ch3/blob/main/packages/unplugin/PLUGIN.md) for extraction rules, SC1090 constraints, and the emitted code shape.
