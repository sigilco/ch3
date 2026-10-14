#!/bin/bash
set -u
cd "$(dirname "$0")"
SC="./node_modules/.bin/scriptc"
mkdir -p out
node lower/lower.mjs >out/lower.txt
fail=0
files=(
  src/01-selfcheck.ts
  src/02-tagged-string.ts
  src/03-tagged-class.ts
  src/04-tagged-union.ts
  src/05-fn-record.ts
  src/06-fn-class-field.ts
  src/07-class-method.ts
  src/08-tree-recursive.ts
  src/09-tree-stack.ts
  src/10-eager-fn.ts
  src/11-callback-child.ts
  src/12-async-linear.ts
  src/13-mixed-return.ts
  src/14-await-unknown.ts
  src/15-throw-promise.ts
  src/16-promise-all.ts
  src/17-regex-escape.ts
  src/18-map-string.ts
  src/19-syntax-modern.ts
  src/20-import-react.ts
  src/21-fn-array.ts
  src/22-fn-record-class.ts
  src/23-element-record.ts
  src/24-element-unknown.ts
  src/25-react-value.ts
  src/30-stream.ts
  src/31-escape-bench.ts
  src/32-print-page.ts
  src/33-serve-island.ts
  src/34-lowered-main.ts
  jsx/view.tsx
)
for f in "${files[@]}"; do
  base="$(basename "$f")"
  echo "===== $f ====="
  if "$SC" coverage "$f" >"out/${base}.cov" 2>&1; then
    echo "COVER_OK $f"
  else
    echo "COVER_FAIL $f"
    fail=1
  fi
done
exit "$fail"
