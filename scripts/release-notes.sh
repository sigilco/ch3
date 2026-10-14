#!/usr/bin/env bash
# Prints the GitHub release body for a tag: the marked CHANGELOG.md block,
# a commit list since the previous tag, and a compare link.
# Fails if the marked block is empty or its heading is not the tag's version.
# Usage: scripts/release-notes.sh v0.2.0 [owner/repo]
set -euo pipefail

TAG="${1:?usage: release-notes.sh <tag> [owner/repo]}"
REPO="${2:-${GITHUB_REPOSITORY:-sigilco/chttp}}"
VER="${TAG#v}"
MAX=100

cd "$(dirname "$0")/.."

BLOCK=$(awk '/<!-- release:start -->/{f=1;next} /<!-- release:end -->/{f=0} f' CHANGELOG.md)
if [ -z "$(printf '%s' "$BLOCK" | tr -d '[:space:]')" ]; then
  echo "release-notes FAIL: no marked release block in CHANGELOG.md" >&2
  exit 1
fi
HEADING=$(printf '%s\n' "$BLOCK" | grep -m1 '^## ' || true)
if [ "$HEADING" != "## $VER" ]; then
  echo "release-notes FAIL: marked block heading is '$HEADING', expected '## $VER'" >&2
  exit 1
fi

# the tag may not exist yet (workflow_dispatch dry run): fall back to HEAD
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then REF="$TAG"; else REF=HEAD; fi
PREV=$(git describe --tags --abbrev=0 "$REF^" 2>/dev/null || true)

printf '%s\n' "$BLOCK"
if [ -n "$PREV" ]; then
  COMMITS=$(git log --no-merges --format='- %s (%h)' "$PREV..$REF")
  TOTAL=$(printf '%s\n' "$COMMITS" | grep -c . || true)
  printf '\n## Commits\n\n'
  if [ "$TOTAL" -gt "$MAX" ]; then
    printf '%s\n' "$COMMITS" | head -n "$MAX"
    printf '\n...and %s more, see the compare link below.\n' "$((TOTAL - MAX))"
  else
    printf '%s\n' "$COMMITS"
  fi
  printf '\nFull changelog: https://github.com/%s/compare/%s...%s\n' "$REPO" "$PREV" "$TAG"
fi
