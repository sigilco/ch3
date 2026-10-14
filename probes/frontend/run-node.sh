#!/bin/bash
set -eu
cd "$(dirname "$0")"
node lower/lower.mjs >/dev/null
for f in src/0*.ts src/1*.ts src/21-fn-array.ts src/32-print-page.ts src/34-lowered-main.ts; do
  echo "-- $f"
  node --experimental-strip-types "$f"
done
echo "-- src/31-escape-bench.ts"
node --experimental-strip-types src/31-escape-bench.ts
