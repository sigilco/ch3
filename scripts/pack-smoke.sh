#!/usr/bin/env bash
# Pack @chttp/router and @chttp/val, install the tarballs into a fresh app,
# compile it to a native ELF with scriptc, then exercise it over HTTP.
# Requires `pnpm -r build` and `pnpm install` to have run.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
T="$(mktemp -d)"
PORT="${SMOKE_PORT:-$((20000 + RANDOM % 20000))}"
PID=""

cleanup() {
  if [ -n "$PID" ]; then
    kill "$PID" 2>/dev/null || true
    wait "$PID" 2>/dev/null || true
  fi
  rm -rf "$T"
}
trap cleanup EXIT

fail() {
  echo "pack-smoke FAIL: $*" >&2
  exit 1
}

cd "$ROOT"
mkdir -p "$T/tar" "$T/app"
pnpm --filter @chttp/router --filter @chttp/val pack --pack-destination "$T/tar" >/dev/null

cp "$ROOT/tests/pack-smoke/app.ts" "$T/app/app.ts"
printf '{"private":true,"type":"module"}\n' >"$T/app/package.json"
(cd "$T/app" && pnpm add --ignore-workspace "$T"/tar/*.tgz >/dev/null)

pnpm exec scriptc build "$T/app/app.ts" -o "$T/app/out" \
  || fail "scriptc build"
echo "build OK"

"$T/app/out" "$PORT" &
PID=$!

for _ in $(seq 1 50); do
  if curl -s -o /dev/null "http://127.0.0.1:$PORT/json"; then break; fi
  sleep 0.1
done

URL="http://127.0.0.1:$PORT"
for i in 1 2 3; do
  got="$(curl -s -X POST -d '{"name":"a","tags":["x"]}' "$URL/val")"
  echo "$got"
  [ "$got" = '{"ok":true}' ] || fail "valid request $i returned: $got"
done

code="$(curl -s -o "$T/bad.json" -w '%{http_code}' -X POST -d '{"name":1}' "$URL/val")"
echo "$code $(cat "$T/bad.json")"
[ "$code" = "422" ] || fail "invalid request status $code"
grep -Eq '^\{"issues":[0-9]+\}$' "$T/bad.json" || fail "invalid request body"

got="$(curl -s "$URL/json")"
echo "$got"
[ "$got" = '{"hello":"world"}' ] || fail "/json returned: $got"

echo "pack-smoke OK"
