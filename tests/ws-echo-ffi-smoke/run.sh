#!/usr/bin/env bash
# Build examples/ws-echo to a native ELF (scriptc --ffi), run it, and
# exercise the /ffi/{text} outbound-FFI route over HTTP.
# Requires `pnpm install` to have run. Not part of `pnpm test` —
# wire it into a CI matrix entry.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORT="${SMOKE_PORT:-$((20000 + RANDOM % 20000))}"
PID=""

cleanup() {
  if [ -n "$PID" ]; then
    kill "$PID" 2>/dev/null || true
    wait "$PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

fail() {
  echo "ws-ffi-smoke FAIL: $*" >&2
  exit 1
}

cd "$ROOT/examples/ws-echo"
pnpm build >/dev/null || fail "scriptc build --ffi"
echo "build OK"

./app "$PORT" &
PID=$!

# Wait for the listener (up to ~5s).
ready=""
for _ in $(seq 1 50); do
  if curl -fsS "http://localhost:$PORT/" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.1
done
[ -n "$ready" ] || fail "server did not start"

got="$(curl -fsS "http://localhost:$PORT/ffi/hello")"
[ "$got" = "0x4f9f2cab" ] || fail "/ffi/hello -> $got (want 0x4f9f2cab, FNV-1a of \"hello\")"

got="$(curl -fsS "http://localhost:$PORT/ffi/world")"
[ "$got" = "0x37a3e893" ] || fail "/ffi/world -> $got (want 0x37a3e893)"

echo "ws-ffi-smoke OK"
