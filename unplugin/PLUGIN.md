# unplugin-ch3

Build-time route lowering for `@sigilco/ch3`.
The plugin statically reads your route registrations and emits a specialized dispatch module next to them, so requests skip the runtime trie walk on every match.
Everything emitted is authored inside the scriptc-compilable subset, so `scriptc build` lowers it into the native binary.

## Install

```sh
npm i -D unplugin-ch3
```

## Usage (vite)

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { ch3Plugin } from 'unplugin-ch3'

export default defineConfig({
  plugins: [ch3Plugin.vite()],
})
```

The factory is unplugin-based, so `ch3Plugin.rollup()`, `ch3Plugin.webpack()`, and `ch3Plugin.esbuild()` also work with their bundlers' plugin arrays.
Only vite has a verified fixture (`fixtures/vite-app/`); the other adapters get the same transform for free.

## Marking route modules

A file is a route-registration module when its name matches the `include` globs (default `**/*.ch3.ts`, `**/*.ch3.js`):

```ts
// src/routes.ch3.ts
import { createRouter } from '@sigilco/ch3'

export const app = createRouter()

app.get('/json', (c) => c.json({ hello: 'world' }))
app.get('/user/:id', (c) => c.json({ id: c.req.param('id') }))
app.post('/echo', (c) => c.text(c.req.body()), { body: true })
app.get('/files/*', (c) => c.text(c.req.param('*')))
```

At `buildStart` (and on each transform/watch event for the file) the plugin writes `src/.ch3/routes.gen.ts` satisfying `docs/route-contract.md`:

- `export class CompiledRoutes extends GenDispatch` whose `dispatch(req, res)` runs per-method sections with route checks ordered by the same precedence as the runtime trie (static before param before wildcard, then registration order).
- `routeTable`: full-shape literals `{ method, path, kind, handlerIdx, needsBody }[]`.
- Per-route runners: literal send-chains (like `(c) => c.json({...})` with literal args and no middleware) compile down to straight `res` writes with no `Ctx` allocation; ctx routes build `ReqView`/`Ctx` through the contract surface (`rv._seedPm`, `_guard`, `_buffer`, `dec`) and call the composed middleware+handler at `app._chains[idx]`.
- `constructor(a: App)` injects the router instance (see the scriptc note below).

## Wiring dispatch into your server

```ts
// src/main.ts
import { app } from './routes.ch3.ts'
import { CompiledRoutes } from './.ch3/routes.gen.ts'

app.withDispatch(new CompiledRoutes(app))
app.serve({ port: 3000 })
```

`app.serve()`/`app.handler()` call the generated dispatch FIRST on every request; `false` declines to the internal dispatch, which covers non-literal registrations, notFound, and misses.
Routes registered while the app is running also keep working through the internal path.

## Declared body buffering

Body buffering is opt-in per the contract's declared-body rule: a handler that reads `c.req.body()` must register with `{ body: true }` or it receives `''`.
The emitted runner calls `_buffer` only for declared routes on body-carrying methods (POST/PUT/PATCH/DELETE); `app.all` keeps a runtime method check.
This is identical to what the internal dispatch does, so generated and runtime paths agree on body semantics.

## What is lowered, what is bailed

Extracted and specialized: `app.<method>(literalPath, handler[, opts])` including `{ body: true }`, `app.all`, `app.on`, `app.use` snapshot semantics, same-file `app.route(prefix, sub)` mounts (replayed in the runtime's trie-DFS order so handler indices line up), literal send-chains (`c.json`, `c.text`, `c.html`, `c.redirect`, `c.status`, `c.header`).

Bailed to runtime registration (still correct through the fallback, listed in a build warning):

- Non-literal paths: variables, function calls, or spreads in the registration call.
- Conditional or loop-driven registration: the plugin does not speculate about control flow.
- Routes registered after a bail whose handler index cannot be proven (indices must match the runtime tables, which still count bailed registrations).
- Mounts of routers imported from other modules.

If a routes module cannot be analyzed at all (no detectable router export), the plugin emits a stub where `dispatch` always returns `false`, so the app runs entirely on the runtime path.
The plugin never silently produces wrong routes: uncertainty means bail, not guesswork.

## Options

| Option       | Default                          | Purpose                                                          |
| ------------ | -------------------------------- | ---------------------------------------------------------------- |
| `include`    | `['**/*.ch3.ts','**/*.ch3.js']` | Globs (relative to root) marking routes modules                  |
| `root`       | vite `config.root`, else `cwd()` | Project root scanned at `buildStart`                             |
| `appExport`  | auto-detect                      | Exported binding carrying the router (`name` or `'default'`)     |
| `imports`    | `['@sigilco/ch3','ch3']`         | Extra specifiers treated as ch3 imports                          |
| `importFrom` | `'@sigilco/ch3'`                 | Specifier emitted for `import type { App }` in the gen file      |

## Compiling with scriptc

The generated module only lowers when the whole app graph is program code.
Under `scriptc build`, a dependency module that imports a binding rooted at a package instantiation (`app = createRouter()` in another file, or any package class) loses lowering for ALL its exports (SC1090): the poisoning applies to value imports AND `import type` edges, and a module that imports `app` cannot call other imported functions either.
Method calls on an npm-rooted binding lower (`app.serve(...)`); field reads and passing it as an argument do not.
`--dynamic` is not an escape hatch either: `IncomingMessage`/`ServerResponse` cannot cross the dynamic boundary.

The emitted shape sidesteps all of it: `CompiledRoutes` is instantiated inside the app-owning entry (`app.withDispatch(new CompiledRoutes(app))`, a method call), the app arrives through the constructor rather than an import, and the contract surface (`GenDispatch`, `ReqView`, `Ctx`, `_buffer`, `_guard`, `dec`) is imported normally when every file reaches the router through SOURCE paths.
Inside this repo the fixture uses a barrel (`fixtures/vite-app/src/ch3.ts`) that re-exports `../../../src/index.ts`; consumers can do the same with an installed source layout or a path alias.
This is also the fast path: `--npm-static` linkage runs measurably slower than program-code linkage.

```sh
cd fixtures/vite-app
npm i
npm run build                 # vite build, includes .ch3/routes.gen.ts
scriptc build src/main.ts -o app-bin
./app-bin 3000
```

`src/.ch3/` is generated output: commit it or regenerate it before the scriptc build, but do not edit it.

## Verification

```sh
cd unplugin && npm test       # node --test: extraction, emit, and an e2e that
                              # imports the real gen file and hits every route kind
cd fixtures/vite-app && npm run build && node dist/main.js 3100
```

The fixture covers: a static-route literal send (`/json`), a param route (`/api/deep/:id`), middleware (`/mwd`), a wildcard (`/files/*`), a bailed non-literal registration (`/dyn` via a runtime variable), POST body buffering (`/echo`), and misses falling through to the runtime path.
