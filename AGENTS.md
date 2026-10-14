# chttp AGENTS.md

chttp is a minimal HTTP router for `node:http`, async-first, zero dependencies, authored in the scriptc compilable subset so the same source compiles to a single native ELF. Workspace: `packages/router` (runtime) and `packages/unplugin` (build-time route-lowering plugin).

## Commands

- `pnpm test` - all workspace tests
- `pnpm --filter @chttp/router build` - build runtime package
- `pnpm lint` - oxlint (type-aware)
- `pnpm fmt` - oxfmt
- `pnpm --filter @chttp/unplugin test` - plugin tests
- `pnpm docs:build` - build docs site

## Releases

All `packages/*` publish at one shared version via pnpm native versioning (`versioning.fixed` in `pnpm-workspace.yaml`; `pnpm change check` guards drift in CI).

1. `pnpm change` per logical change, commit the intent file with the change.
2. At release: `pnpm version -r` (bumps the fixed group, consumes intents, writes CHANGELOGs), commit, tag `v<version>`.
3. Tag push triggers `.github/workflows/release.yml`: verifies every package.json matches the tag, publishes all four.

## Scriptc subset rules (packages/router/src)

These are hard bans. The full rationale lives in `ARCHITECTURE.md` section 0.

- Handlers/middleware may return a Promise; dispatch settles a non-settled chain result by `await`ing it inside `settleChain` (the package's only async function; fire-and-forget). Sync-complete results — `undefined`, `null`, or the `c` object — keep a zero-microtask path via `isSettled`. NEVER detect promises by reading `.then` as a value (`typeof r.then` silently lowers to `undefined`), `instanceof Promise` (SC1090), or a union mixing Promise/non-Promise arms (SC2009).
- `| null` unions only. Never `undefined` (SC3004).
- No `Map`/`Set`/`Object.create(null)`/`Object.freeze`. Plain `({})` records only. Classes only for `Context`, `ChttpRequest`, `HttpError`.
- Indexed `for` loops (and `for...of` over arrays). Never `for...in`.
- No `new Function`/`eval`, no non-program `instanceof`, no object/method-shorthand.
- Concrete types on all route/middleware tables; no `any[]`/`unknown[]` (SC1090).

`docs/route-contract.md` is the frozen seam contract between runtime and generated dispatch. Do not diverge from it.

## Conventions

- Conventional commits, atomic commits (one logical change each).
- Any handler or dispatch change ships with tests.
- Any performance claim requires re-running the relevant bench cell first. `bench/RESULTS-v2.md` is the baseline.
- Plugin work is fixture-first: `fixtures/vite-app` must build before an emit change lands. See `packages/unplugin/AGENTS.md`.
