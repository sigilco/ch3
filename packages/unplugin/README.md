# @chttp/unplugin

Build-time route lowering for [chttp](https://github.com/sigilco/chttp). Scans `*.chttp.ts` route modules at build start, extracts the literal route table, and emits a specialized dispatch module (`.chttp/routes.gen.ts`) so matching requests skip the runtime trie walk.

```ts
// vite.config.ts
import { chttpPlugin } from "@chttp/unplugin";

export default {
  plugins: [chttpPlugin.vite()],
};
```

```ts
// src/main.ts — register the generated dispatch once
import { app } from "./routes.chttp.ts";
import { CompiledRoutes } from "./.chttp/routes.gen.ts";

app.withDispatch(new CompiledRoutes(app));
app.serve({ port: 3000 });
```

chttp itself is authored in the [scriptc](https://github.com/sigilco/scriptc) compilable subset and lowers to a native ELF on its own. This plugin is an elective optimization on top: it recovers the declarative route table from imperative `app.get()` / `app.use()` / `app.mount()` registrations, which a general compiler cannot see. Two output modes:

- Plain vite/rollup: the generated dispatch bundles into your JS dist.
- With [unplugin-scriptc](https://github.com/sigilco/unplugin-scriptc): the dispatch compiles to native code inside the ELF.

Routes the analyzer cannot prove literal stay on the runtime router with a build warning. It never emits a wrong route. The emitted module satisfies the frozen contract in [`contracts/route-contract.md`](https://github.com/sigilco/chttp/blob/main/contracts/route-contract.md) and carries a `ROUTE_CONTRACT_VERSION` stamp that `app.withDispatch()` validates at startup, so a stale generated file fails loudly instead of misbehaving.

## Options

| Option       | Default                                | Purpose                                                                                                       |
| ------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `include`    | `["**/*.chttp.ts", "**/*.chttp.js"]`   | Globs (relative to root) marking route-registration modules                                                   |
| `root`       | vite config root, else `process.cwd()` | Project root to scan                                                                                          |
| `importFrom` | `"chttp"`                              | Import specifier emitted into the generated file                                                              |
| `appExport`  | auto-detect                            | Exported binding carrying the router instance                                                                 |
| `imports`    | `["chttp"]`                            | Extra module specifiers treated as chttp imports                                                              |
| `parser`     | `"classic"`                            | `"tsgo"` routes extraction through the TypeScript 7 native compiler (`typescript/sync` nightly, experimental) |

## Install

```sh
pnpm add -D @chttp/unplugin
```

Peer dependency: `chttp`. The default parser uses the classic TypeScript API; the `tsgo` option requires a pinned `typescript@next` install and is experimental (measured slower than classic at parse-only workloads in `bench/RESULTS-plugin.md`, kept for re-evaluation as the native API stabilizes).

## Why source exports

The package ships TypeScript source (`files: ["src"]`, types point at `.ts`). Bundler plugins are build-time code, and scriptc compiles them as program code from source.

License: Apache-2.0. See [PLUGIN.md](https://github.com/sigilco/chttp/blob/main/packages/unplugin/PLUGIN.md) for extraction rules, SC1090 constraints, and the emitted code shape.
