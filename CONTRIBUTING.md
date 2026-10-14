# Contributing

Thanks for helping with chttp. This file covers the short path from clone to a mergeable PR.

## Setup

Requires node 22 or newer and pnpm (the exact version is pinned in `packageManager`). Use pnpm only, never npm.

```sh
pnpm install
pnpm -r build
```

## Checks

- `pnpm lint` runs oxlint, `pnpm fmt` runs oxfmt.
- `pnpm test` runs every workspace test. Any handler or dispatch change ships with tests.
- `scripts/scriptc-gate.sh` (after `pnpm -r build`) fails unless every gate app compiles 100% static under `scriptc coverage`. The runtime packages are authored in the scriptc subset, so read the subset rules in `AGENTS.md` before touching `packages/router/src`.
- `pnpm smoke:pack` packs the packages, compiles the tarballs to an ELF with scriptc and curls it.
- Performance claims need the relevant bench cell re-run first. `bench/RESULTS-v2.md` is the baseline.

## Change intents

Every change that touches `packages/*` records an intent with `pnpm change`, naming the affected packages, the bump type and a one line summary that becomes the changelog entry. Commit the intent file with the change. If a change needs no release, record it with `--bump none`. `pnpm change check` validates intents and versions.

## Commits and PRs

Use conventional commits and keep them atomic: one logical change per commit. Link the PR to its issue. Do not add co-author trailers.

## Releases

Maintainers only. See `RELEASING.md`. Releases are packed and published with pnpm, never npm.
