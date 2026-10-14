# Releasing

All `packages/*` publish at one shared version via pnpm native versioning (`versioning.fixed` in `pnpm-workspace.yaml`). Private examples, demo and fixtures are excluded with `versioning.ignore`.

Releases are packed and published with pnpm, never npm. Internal ranges are `workspace:^`, and only pnpm rewrites them to real semver ranges in the tarball. `npm publish` would ship the `workspace:` protocol and break installs.

## Cutting a release

1. `pnpm change status` shows the pending intents and the planned versions.
1. `pnpm version -r` bumps the fixed group, consumes the intents and writes a `CHANGELOG.md` inside every package.
1. `node scripts/changelog-root.mjs` writes the new version's entry into the root `CHANGELOG.md`, grouped as Breaking, Features and Fixes, and wraps it in `<!-- release:start -->` and `<!-- release:end -->`. Edit the entry for voice. Re-running keeps your edits.
1. Verify: `pnpm change check`, `pnpm -r build`, `pnpm -r test`, `pnpm smoke:pack`, `pnpm docs:build`.
1. Commit as the release PR (`chore(release): v<version>`) and merge it.
1. Tag `v<version>` on main and push the tag.

## What CI does

The tag push triggers `.github/workflows/release.yml`. It verifies every package.json matches the tag, then publishes all packages with `pnpm -r publish` behind the `npm-publish` environment approval.

## Retrying

npm cannot roll back. If a publish fails part way, fix the cause and re-run the failed job. Do not re-tag.
