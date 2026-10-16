#!/usr/bin/env bash
# ELF smoke for @chttp/static: compiles gate.ts to a native executable via
# `scriptc build`, serves a scratch dir, and curl-checks the SPA-serving
# surface end to end — root, an explicit file, a byte-identical binary
# asset, embedded records, and the SPA Accept rules. This is the gate the
# static analysis cannot give: string-method sites in serve.ts/mime.ts
# lowered fine on some scriptc versions but fenced at runtime on others
# (reported on 0.3.3; fine on 0.3.4).
set -euo pipefail

cd "$(dirname "$0")/.."

fail() {
  echo "elf.test.sh FAIL: $*" >&2
  exit 1
}

BIN="scriptc"
if [ -x ../../node_modules/.bin/scriptc ]; then
  BIN="../../node_modules/.bin/scriptc"
fi

mkdir -p build build/elf-public
echo '<h1>hi</h1>' > build/elf-public/index.html
head -c 1024 /dev/urandom > build/elf-public/blob.bin
echo 'body{}' > build/elf-public/app.css

"$BIN" build gate.ts -o build/gate-elf || fail "scriptc build"

PORT=13987
./build/gate-elf "$PORT" build/elf-public &
ELF=$!
cleanup() { kill "$ELF" 2>/dev/null || true; }
trap cleanup EXIT

for i in $(seq 1 40); do
  curl -sf "http://127.0.0.1:$PORT/api/ping" > /dev/null 2>&1 && break
  sleep 0.25
  [ "$i" = 40 ] && fail "ELF never came up"
done

code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

[ "$(code http://127.0.0.1:$PORT/api/ping)" = 200 ] || fail "/api/ping"
[ "$(code http://127.0.0.1:$PORT/)" = 200 ] || fail "/"
[ "$(code http://127.0.0.1:$PORT/index.html)" = 200 ] || fail "/index.html"

curl -s "http://127.0.0.1:$PORT/blob.bin" -o build/elf-blob.out
cmp -s build/elf-public/blob.bin build/elf-blob.out \
  || fail "binary asset not byte-identical"

[ "$(code http://127.0.0.1:$PORT/embedded/baked.txt)" = 200 ] \
  || fail "embedded record"

# SPA fallback: html navigations get index.html, asset/api misses 404.
[ "$(code -H 'accept: text/html' http://127.0.0.1:$PORT/nope/path)" = 200 ] \
  || fail "SPA html navigation did not fall back"
[ "$(code http://127.0.0.1:$PORT/nope/path)" = 404 ] \
  || fail "non-html miss should 404"

echo "elf.test.sh OK"
