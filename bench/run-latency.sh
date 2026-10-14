#!/usr/bin/env bash
# wrk2 cross-validation pass — bench-credible.
#   bash bench/run-latency.sh              # all subjects
#   bash bench/run-latency.sh raw-node ... # subset
#
# For each subject's headline cells (json, user, root, postuser) runs wrk2
# at 80% of that cell's autocannon median rps (read from results/*.jsonl),
# mirroring the-benchmarker/web-frameworks' LATENCY_RATE idea: latency under a
# defined, sustainable load with coordinated-omission correction (-L spectrum).
# If achieved rps is <80% of target, the subject can't sustain the rate and
# its latency numbers are flagged. Writes results-wrk2/<name>.jsonl.
set -u
cd "$(dirname "$0")"
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH:$HOME/bin:$HOME/.bun/bin"
export WRK2="${WRK2:-$HOME/bin/wrk2}"

BASE="http://127.0.0.1:3000"
RESULTS=results-wrk2
mkdir -p "$RESULTS" logs

SUBJECTS=(
  "chttp-node|node apps/chttp.ts"
  "chttp-bun|bun apps/chttp.ts"
  "chttp-scriptc|./bin/chttp-scriptc"
  "chttp-fast-scriptc|./bin/chttp-fast-scriptc"
  "raw-node|node apps/raw.ts"
  "raw-bun|bun apps/raw-bun.ts"
  "raw-scriptc|./bin/raw-scriptc"
  "h3-node|node apps/h3.mjs"
  "h3-bun|bun apps/h3-bun.mjs"
  "hono-node|node apps/hono.mjs"
  "hono-bun|bun apps/hono-bun.ts"
  "fmw-node|node apps/fmw.mjs"
  "fmw-bun|bun apps/fmw.mjs"
  "fastify-node|node apps/fastify.mjs"
  "fastify-bun|bun apps/fastify.mjs"
  "express-node|node apps/express.mjs"
  "express-bun|bun apps/express.mjs"
  "go-chi|./ceilings/bin/go-chi"
  "rust-axum|./ceilings/bin/rust-axum"
  "c-mongoose|./ceilings/bin/c-mongoose"
)

FILTER=("$@")
want() {
  if [ "${#FILTER[@]}" -eq 0 ]; then return 0; fi
  local f; for f in "${FILTER[@]}"; do [ "$f" = "$1" ] && return 0; done
  return 1
}

for entry in "${SUBJECTS[@]}"; do
  IFS='|' read -r name cmd <<< "$entry"
  want "$name" || continue
  meds=$(node lib/median.mjs "$name")
  if [ "$meds" = "{}" ]; then
    echo "== $name: no autocannon results yet, skipping" >&2
    continue
  fi
  echo "===== $name wrk2 ====="
  for p in $(ss -tlnp 2>/dev/null | grep ':3000' | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u); do kill "$p" 2>/dev/null; done
  sleep 0.3
  # shellcheck disable=SC2086
  $cmd > "logs/$name.wrk2.log" 2>&1 &
  pid=$!
  ok=0
  for i in $(seq 1 150); do curl -sf "$BASE/json" >/dev/null 2>&1 && { ok=1; break; }; sleep 0.2; done
  if [ "$ok" = 0 ]; then echo "  !! $name failed to start" >&2; kill "$pid" 2>/dev/null; continue; fi

  for cell in json user root postuser; do
    case $cell in
      json) url="$BASE/json" ;;
      user) url="$BASE/user/42" ;;
      root) url="$BASE/" ;;
      postuser) url="$BASE/user" ;;
    esac
    rate=$(node -e "const m=$meds; const r=Math.round((m['$cell']||0)*0.8); console.log(r)")
    [ "$rate" -lt 1000 ] && { echo "  $cell: no baseline rps, skip"; continue; }
    post=""
    [ "$cell" = postuser ] && post="--post"
    # shellcheck disable=SC2086
    node lib/wrk2-run.mjs --url "$url" -R "$rate" -d 10 -c 64 -t 4 $post \
      | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const r=JSON.parse(d);r.subject='$name';r.cell='$cell';r.ac_rps=$(node -e "const m=$meds; console.log(m['$cell']||0)");console.log(JSON.stringify(r))})" >> "$RESULTS/$name.jsonl"
    printf '  %s @%s done\n' "$cell" "$rate"
  done
  kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null
  echo "===== $name done ====="
done
echo "all done -> $RESULTS/"
