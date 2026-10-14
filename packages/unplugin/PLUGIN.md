# @chttp/unplugin

Build-time route lowering for `chttp`.
The plugin statically reads your route registrations and emits a specialized dispatch module next to them, so requests skip the runtime trie walk on every match.
Everything emitted is authored inside the scriptc-compilable subset, so `scriptc build` lowers it into the native binary.

## Install

```sh
npm i -D @chttp/unplugin
```

## Usage (vite)

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { chttpPlugin } from "@chttp/unplugin";

export default defineConfig({
  plugins: [chttpPlugin.vite()],
});
```

The factory is unplugin-based, so `chttpPlugin.rollup()`, `chttpPlugin.webpack()`, and `chttpPlugin.esbuild()` also work with their bundlers' plugin arrays.
Only vite has a verified fixture (`fixtures/vite-app/`); the other adapters get the same transform for free.

## Marking route modules

A file is a route-registration module when its name matches the `include` globs (default `**/*.chttp.ts`, `**/*.chttp.js`):

```ts
// src/routes.chttp.ts
import { createRouter } from "chttp";

export const app = createRouter();

app.get("/json", (c) => c.json({ hello: "world" }));
app.get("/user/:id", (c) => c.json({ id: c.req.param("id") }));
app.post("/echo", (c) => c.text(c.req.body()), { body: true });
app.get("/files/*", (c) => c.text(c.req.param("*")));
```

At `buildStart` (and on each transform/watch event for the file) the plugin writes `src/.chttp/routes.gen.ts` satisfying `docs/route-contract.md`:

- `export class CompiledRoutes extends GenDispatch` whose `dispatch(req, res)` runs per-method sections with route checks ordered by the same precedence as the runtime trie (static before param before wildcard, then registration order).
- `routeTable`: full-shape literals `{ method, path, kind, handlerIdx, needsBody }[]`.
- Per-route runners: literal send-chains (like `(c) => c.json({...})` with literal args and no middleware) compile down to straight `res` writes with no `Ctx` allocation; ctx routes build `ReqView`/`Ctx` through the contract surface (`rv._seedPm`, `_guard`, `_buffer`, `dec`) and call the composed middleware+handler at `app._chains[idx]`.
- `constructor(a: App)` injects the router instance (see the scriptc note below).

## Wiring dispatch into your server

```ts
// src/main.ts
import { app } from "./routes.chttp.ts";
import { CompiledRoutes } from "./.chttp/routes.gen.ts";

app.withDispatch(new CompiledRoutes(app));
app.serve({ port: 3000 });
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

| Option       | Default                             | Purpose                                                                                                          |
| ------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `include`    | `['**/*.chttp.ts','**/*.chttp.js']` | Globs (relative to root) marking routes modules                                                                  |
| `root`       | vite `config.root`, else `cwd()`    | Project root scanned at `buildStart`                                                                             |
| `appExport`  | auto-detect                         | Exported binding carrying the router (`name` or `'default'`)                                                     |
| `imports`    | `['chttp']`                         | Extra specifiers treated as chttp imports                                                                        |
| `importFrom` | `'chttp'`                           | Specifier emitted for `import type { App }` in the gen file                                                      |
| `parser`     | `'classic'`                         | Parser backend: `'classic'` (tsc API) or `'tsgo'` (experimental, see below)                                      |
| `openapi`    | `false`                             | Emit `.chttp/routes.openapi.ts` (an OpenAPI 3.1 side channel); `true` or `{ path?, title?, version?, imports? }` |

## Experimental: `parser: "tsgo"`

The parser seam behind extraction is pluggable. `classic` (default) uses the `typescript` package's tsc API. `tsgo` uses the typescript-go native compiler's client API (`typescript/sync` on a `typescript@next` 7.x nightly), where parsing runs in a spawned native server process and the client decodes the binary AST into node objects shaped like the classic ones.

Status and caveats:

- The nightly sync API is explicitly unstable and breaks between nightlies. If you use `tsgo`, pin the exact nightly version you tested.
- Requires Node >= 22.12 (synchronous `require()` of ESM is how the sync client loads).
- Without a resolvable `typescript/sync`, selecting `tsgo` prints a warning and falls back to `classic`; a classic-only install never loads tsgo code.
- The default will only be reconsidered once the API is stable (TS 7.1+) and the plugin bench (task 4) justifies it.

```ts
chttpPlugin.vite({ parser: "tsgo" });
```

## Compiling with scriptc

`scriptc` stays a separate CLI step on your own entry — the plugin only emits the module; it does not wrap the compiler, so all `scriptc build` flags (`--optimization`, `--target`, `--npm-static`, output) remain yours.

Two tiers under scriptc v0.3.0's automatic package compilation:

- **Runtime dispatch, npm-installed `chttp`**: fully static out of the box. `scriptc build app.ts` on a project that does `npm i chttp` compiles the package's dist + your entry to native with zero extra layout work (verified: 100% static, ELF serves). This is the drop-in tier.
- **Compiled dispatch (`withDispatch` + the emitted module)**: only lowers when chttp is reachable as program code. `CompiledRoutes extends GenDispatch` must override a package-frozen signature and `g.dispatch` inside the packaged `withDispatch` path is a deferred site, so a `node_modules` copy — even one whose `main` is `.ts` — cannot carry it (SC1090/SC2013). Reach chttp through SOURCE paths instead: a vendored `src/` copy (the published tarball ships `src/` and exports `./src/index.ts` for exactly this), chttp as a workspace member, or a relative-path barrel like `fixtures/vite-app/src/chttp.ts` (`export * from '../../../src/index.ts'`). TypeScript source linked that way compiles as program modules and the whole graph lowers.

Under program code the emitted shape sidesteps the older SC1090 poisoning rules: `CompiledRoutes` is instantiated inside the app-owning entry (`app.withDispatch(new CompiledRoutes(app))`, a method call), the app arrives through the constructor rather than an import, and the contract surface (`GenDispatch`, `ReqView`, `Ctx`, `_buffer`, `_guard`, `dec`) imports normally.
Program-code linkage is also the fast path: `--npm-static` linkage runs measurably slower.

```sh
cd fixtures/vite-app
npm i
npm run build                 # vite build, includes .chttp/routes.gen.ts
scriptc build src/main.ts -o app-bin
./app-bin 3000
```

`src/.chttp/` is generated output: commit it or regenerate it before the scriptc build, but do not edit it.

## Verification

```sh
pnpm --filter @chttp/unplugin test  # node --test: extraction, emit, and an e2e that
                                  # imports the real gen file and hits every route kind
cd fixtures/vite-app && npm run build && node dist/main.js 3100
```

The fixture covers: a static-route literal send (`/json`), a param route (`/api/deep/:id`), middleware (`/mwd`), a wildcard (`/files/*`), a bailed non-literal registration (`/dyn` via a runtime variable), POST body buffering (`/echo`), and misses falling through to the runtime path.

## OpenAPI side channel (`openapi: true`)

Setting `openapi` makes the plugin emit a second file next to the gen dispatch: `.chttp/routes.openapi.ts`, exporting `openapiDocument` (OpenAPI 3.1) plus a `chttpRouteTable` passthrough (`{ method, path }[]`).
It is a plain-TS side channel: the router never imports it, it never enters a scriptc build, and routes.gen.ts is byte-identical with the option on or off.
Pass an object for `path` (default `routes.openapi.ts`), `title` (default: the routes module basename), `version` (default `1.0.0`), or `imports` (extra module specifiers treated as `@chttp/val`; the package name is always recognized).

A route carries a schema when the extractor can PROVE one, in the handler AST: a `v.parse(schema, ...)` or `v.safeParse(schema, ...)` call where both arguments are statically resolvable.
The target argument must read the request view on the handler's own context parameter: `c.req.body()` (also wrapped as `JSON.parse(c.req.body())`), `c.req.query(...)`/`c.req.queryAll()`, or `c.req.param(...)`, binding to `requestBody`, query parameters, and path parameters respectively.
The schema argument must be a `val` factory expression the printer can re-emit: literals, `val.<factory>(...)` calls, or a module-level `const` of one, including consts referencing earlier consts (emitted in declaration order, which is a valid dependency order).
The emitted module re-declares each proven schema and calls `toOpenApiSchema` from the SAME specifier your routes module imported, so schemas evaluate in your own val graph with the val copy that validates requests.
Consts named `val`, `toOpenApiSchema`, `openapiDocument`, `chttpRouteTable`, or starting `__chttp` collide with emitter-owned names and are refused: those routes document without a schema.

Anything that cannot be proven (a dynamic schema, a foreign import, a target on another variable) means the route documents WITHOUT its schema, plus a build warning.
Bail, never guess.
