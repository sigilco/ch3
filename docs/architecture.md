# Coding agents

Read this before writing or changing chttp code. The core is authored in the scriptc compilable subset, so some normal TypeScript is banned.

## Give an agent the docs

These docs are published for agents too: [llms.txt](https://chttpjs.pages.dev/llms.txt) is the page index, [llms-full.txt](https://chttpjs.pages.dev/llms-full.txt) is every page in one file. Point your agent at either.

## Subset rules for `packages/router/src`

- `| null` unions only. Never `undefined`.
- No `Map`, `Set`, `Object.create(null)`, `Object.freeze`. Plain `({})` records only.
- Classes only for `Context`, `ChttpRequest`, `HttpError`.
- Indexed `for` loops or `for...of` over arrays. Never `for...in`.
- No `new Function`, `eval`, non-program `instanceof`, object or method shorthand.
- Concrete types on route and middleware tables. No `any[]` or `unknown[]`.
- Never detect promises with `typeof r.then` or `instanceof Promise`. Dispatch settles non-settled results by `await` inside `settleChain`.

```ts
// ok
for (let i = 0; i < routes.length; i++) {}
const rec: { [k: string]: string } = {};

// banned
for (const k in rec) {}
const m = new Map();
```

## Shape of the code

- One core file, `packages/router/src/index.ts`: router, context, node adapter.
- Route data is plain records. Handlers live in `App._fns`, nodes carry indices.
- Matching uses an explicit frame stack, no recursion.
- Response helpers call `res.end()` at statement level.

## Where to read more

- [ARCHITECTURE.md](https://github.com/sigilco/chttp/blob/main/ARCHITECTURE.md): request flow, compose model, error path, scriptc compilation.
- [AGENTS.md](https://github.com/sigilco/chttp/blob/main/AGENTS.md): commands, release flow, full ban list.
- Repo skills: [`chttp-app-dev`](https://github.com/sigilco/chttp/blob/main/.agents/skills/chttp-app-dev/SKILL.md) for writing subset-compatible apps, [`chttp-integration`](https://github.com/sigilco/chttp/blob/main/.agents/skills/chttp-integration/SKILL.md) for wiring chttp and the plugin into an existing project.
- Build-time lowering: [Route lowering plugin](unplugin.md).
