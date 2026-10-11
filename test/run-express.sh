#!/usr/bin/env bash
# ch3/express verification: node --test on shim tests + scriptc static build smoke.
# Copies test/stub-express.ts to src/index.ts ONLY when the real core is absent.
set -euo pipefail
cd "$(dirname "$0")/.."

COPIED=0
if [ ! -f src/index.ts ]; then
  cp test/stub-express.ts src/index.ts
  COPIED=1
fi
cleanup() {
  if [ "$COPIED" = "1" ]; then
    rm -f src/index.ts
  fi
}
trap cleanup EXIT

node --test test/express.test.ts

if command -v scriptc >/dev/null 2>&1; then
  scriptc build test/smoke-express.ts -o .scriptc/smoke-express
  echo "scriptc build OK: .scriptc/smoke-express"
else
  echo "scriptc not on PATH — skipping compile smoke"
fi
