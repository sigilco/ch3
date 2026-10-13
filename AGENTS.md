# ch3 AGENTS.md

ch3 is a minimal HTTP router for `node:http`, async-first, zero dependencies, authored in the scriptc compilable subset so the same source compiles to a single native ELF. Workspace: `packages/ch3` (runtime) and `packages/ch3/src/unplugin` (build-time route-lowering plugin).

## Commands

- `pnpm test` - all workspace tests
- `pnpm --filter ch3 build` - build runtime package
- `pnpm lint` - oxlint (type-aware)
- `pnpm fmt` - oxfmt
- `pnpm --dir packages/ch3 test` - plugin tests
- `pnpm docs:build` - build docs site

## Scriptc subset rules (packages/ch3/src)

These are hard bans. The full rationale lives in `ARCHITECTURE.md` section 0.

- Handlers/middleware may return a Promise; dispatch settles a non-settled chain result by `await`ing it inside `settleChain` (the package's only async function; fire-and-forget). Sync-complete results — `undefined`, `null`, or the `c` object — keep a zero-microtask path via `isSettled`. NEVER detect promises by reading `.then` as a value (`typeof r.then` silently lowers to `undefined`), `instanceof Promise` (SC1090), or a union mixing Promise/non-Promise arms (SC2009).
- `| null` unions only. Never `undefined` (SC3004).
- No `Map`/`Set`/`Object.create(null)`/`Object.freeze`. Plain `({})` records only. Classes only for `Context`, `Ch3Request`, `HttpError`.
- Indexed `for` loops (and `for...of` over arrays). Never `for...in`.
- No `new Function`/`eval`, no non-program `instanceof`, no object/method-shorthand.
- Concrete types on all route/middleware tables; no `any[]`/`unknown[]` (SC1090).

`docs/route-contract.md` is the frozen seam contract between runtime and generated dispatch. Do not diverge from it.

## Conventions

- Conventional commits, atomic commits (one logical change each).
- Any handler or dispatch change ships with tests.
- Any performance claim requires re-running the relevant bench cell first. `bench/RESULTS-v2.md` is the baseline.
- Plugin work is fixture-first: `fixtures/vite-app` must build before an emit change lands. See `packages/ch3/src/unplugin/AGENTS.md`.
