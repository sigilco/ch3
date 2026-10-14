#!/usr/bin/env bash
# Packs every publishable package with pnpm and fails if any tarball
# package.json still contains the workspace: protocol (what npm would ship).
set -euo pipefail

cd "$(dirname "$0")/.."
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT

pnpm -r --filter "./packages/*" pack --pack-destination "$T" >/dev/null
fail=0
for tgz in "$T"/*.tgz; do
  if tar -xzOf "$tgz" package/package.json | grep -q '"workspace:'; then
    echo "check-packed FAIL: $(basename "$tgz") still contains workspace: ranges" >&2
    fail=1
  fi
done
[ "$fail" = 0 ] && echo "check-packed OK: $(ls "$T" | wc -l | tr -d ' ') tarballs"
exit "$fail"
