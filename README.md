# @sigilco/ch3

Synchronous `node:http` router authored inside the **scriptc compilable
subset**: the whole package lowers statically into a native ELF via
`scriptc build <app> --npm-static @sigilco/ch3`, and runs as an ordinary
zero-dependency package under node/bun. Zero runtime dependencies.

Public subpaths (exports-map skeleton — implementations land per-branch):

- `@sigilco/ch3` — core router (`createRouter`, `Context`, `HttpError`)
- `@sigilco/ch3/h3` — h3 API-compat shim
- `@sigilco/ch3/fmw` — find-my-way API-compat shim
- `@sigilco/ch3/hono` — hono API-compat shim
- `@sigilco/ch3/express` — express API-compat shim

Shims are pure re-mapping surfaces: they reuse handler signatures and adapt
onto the ch3 core — no code from the real packages is bundled or executed.

## Layout

- `src/index.ts` — core public surface
- `src/shims/*.ts` — shim entrypoints
- `test/`, `demo/`, `bench/` — verification surfaces
- `DESIGN.md` — frozen design contract

## Build & test

```sh
npm run build   # tsc → dist/esm (ESM + .d.ts) and dist/cjs (CJS)
npm test        # npm run build && node --test test/
```
