# Route lowering plugin

`@ch3/unplugin` — build-time route lowering for `ch3`, a separate workspace package. This is the point of the project's build story: the plugin statically reads your route registrations and emits a specialized dispatch module next to them, so requests skip the runtime trie walk on every match. Everything emitted is authored inside the scriptc-compilable subset, so `scriptc build` lowers it into the native binary.

Full reference: [packages/unplugin/PLUGIN.md](https://github.com/sigilco/ch3/blob/main/packages/unplugin/PLUGIN.md).

## What the plugin does

At `buildStart` (and on each watch event for the file) the plugin scans route modules (default `**/*.ch3.ts`, `**/*.ch3.js`) and emits `.ch3/routes.gen.ts` next to them, satisfying the [generated-dispatch contract](route-contract.md):

- `export class CompiledRoutes extends GenDispatch` whose `dispatch(req, res)` runs per-method sections ordered like the runtime trie (static before param before wildcard, then registration order).
- `routeTable`: full-shape literals `{ method, path, kind, handlerIdx, needsBody }[]`.
- Per-route runners: literal send-chains (`c.json`, `c.text`, ...) compile to straight `res` writes with no `Ctx` allocation; ctx routes build `ReqView`/`Ctx` through the contract surface and call the composed middleware+handler at `app._chains[idx]`.
- `constructor(a: App)` injects the router instance (needed for scriptc lowering; see the scriptc section in PLUGIN.md).

## Bail, not guess

The plugin never silently produces wrong routes. Extracted: literal-path `app.<method>()` calls, `app.all`/`app.on`, `app.use` snapshot semantics, same-file mounts, literal send-chains. Bailed to runtime registration (with a build warning):

- Non-literal paths (variables, calls, spreads).
- Conditional or loop-driven registration.
- Registrations whose handler index cannot be proven against the runtime tables.
- Mounts of routers imported from other modules.

If a routes module cannot be analyzed at all, the plugin emits a stub whose `dispatch` always returns `false`, so the app runs entirely on the runtime path.

## Usage (vite)

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { ch3Plugin } from "@ch3/unplugin"

export default defineConfig({
  plugins: [ch3Plugin.vite()],
})
```

Mark a routes module:

```ts
// src/routes.ch3.ts
import { createRouter } from 'ch3'

export const app = createRouter()

app.get('/user/:id', (c) => c.json({ id: c.req.param('id') }))
app.post('/echo', (c) => c.text(c.req.body()), { body: true })
```

Wire the generated dispatch:

```ts
// src/main.ts
import { app } from './routes.ch3.ts'
import { CompiledRoutes } from './.ch3/routes.gen.ts'

app.withDispatch(new CompiledRoutes(app))
app.serve({ port: 3000 })
```

`app.serve()` calls the generated dispatch first; `false` declines to the internal dispatch, which covers bails, `notFound`, and misses. Body buffering is opt-in per the contract: a handler reading `c.req.body()` must register with `{ body: true }` or it receives `''`.

The factory is unplugin-based, so `ch3Plugin.rollup()`, `ch3Plugin.webpack()`, and `ch3Plugin.esbuild()` work too. Only vite is verified by a fixture (`fixtures/vite-app/`): run `npm i && npm run build` there, then `node dist/main.js 3100` to hit static, param, middleware, wildcard, bailed, POST-body, and miss routes.
