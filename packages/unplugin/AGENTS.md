# @chttp/unplugin AGENTS.md

Build-time route lowering for chttp. Emits a specialized dispatch module so requests skip the runtime trie walk.

## Contract

- `contracts/route-contract.md` is the frozen emit contract. Emitted modules must satisfy it exactly. Do not edit it unilaterally.
- Bail, never guess. If route analysis is uncertain about any route, emit nothing for it and let runtime fallback handle it, plus a build warning. Never emit a wrong route.

## Generated files

- `.chttp/routes.gen.ts` (and anything under `.chttp/`) is generated output. Never hand-edit. Change the generator, not the artifact.

## Testing

- Fixture-first: `fixtures/vite-app` must build clean before any emit change lands. Extend fixtures to cover the new emit behavior.

## Gotchas

- SC1090 poisoning: under `scriptc build`, a module importing a binding rooted at a package instantiation loses lowering for all its exports, including via `import type` edges. Details and workarounds in `PLUGIN.md`.
