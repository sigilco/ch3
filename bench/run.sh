#!/usr/bin/env bash
# ch3 bench suite — DESIGN.md §5 + bench-credible extensions.
#   bash bench/run.sh              # all subjects
#   bash bench/run.sh raw-node hono-bun ...   # subset
#
# Methodology: warmup `autocannon -c16 -d2` (discarded), then per cell
# `-c64 -d6` x3, median recorded — x5 on the `json` headline cell.
# Cells: json, user, echo64, echo1k, deep, files, missing, mixed (canonical),
#        root (GET /, web-frameworks), hello (GET /hello, Raygun plaintext),
#        postuser (POST /user, web-frameworks).
# Ceilings run cells: json user echo64 echo1k root hello postuser.
# Then PIPE_SUBJECTS get a fastify-parity cell: `-c100 -p10 -d10` on /json
# (mirrors fastify/benchmarks' autocannon -c100 -d40 -p10 shape, shorter d).
# Also: spawn->200 cold start (median of 10), RSS after 100k reqs,
# binary size for ELF subjects.
set -u
cd "$(dirname "$0")"
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH:$HOME/bin:$HOME/.bun/bin"

BASE="http://127.0.0.1:3000"
RESULTS=results
mkdir -p "$RESULTS" logs

# name | command | cellset (full|ceil) | binary-path (optional)
SUBJECTS=(
  "ch3-node|node apps/ch3.ts|full|"
  "ch3-bun|bun apps/ch3.ts|full|"
  "ch3-scriptc|./bin/ch3-scriptc|full|bin/ch3-scriptc"
  "ch3-fast-scriptc|./bin/ch3-fast-scriptc|full|bin/ch3-fast-scriptc"
  "raw-node|node apps/raw.ts|full|"
  "raw-bun|bun apps/raw-bun.ts|full|"
  "raw-scriptc|./bin/raw-scriptc|full|bin/raw-scriptc"
  "h3-node|node apps/h3.mjs|full|"
  "h3-bun|bun apps/h3-bun.mjs|full|"
  "hono-node|node apps/hono.mjs|full|"
  "hono-bun|bun apps/hono-bun.ts|full|"
  "fmw-node|node apps/fmw.mjs|full|"
  "fmw-bun|bun apps/fmw.mjs|full|"
  "fastify-node|node apps/fastify.mjs|full|"
  "fastify-bun|bun apps/fastify.mjs|full|"
  "express-node|node apps/express.mjs|full|"
  "express-bun|bun apps/express.mjs|full|"
  "go-chi|./ceilings/bin/go-chi|ceil|ceilings/bin/go-chi"
  "rust-axum|./ceilings/bin/rust-axum|ceil|ceilings/bin/rust-axum"
  "c-mongoose|./ceilings/bin/c-mongoose|ceil|ceilings/bin/c-mongoose"
)

# fastify-parity pipelined cell (their published table: -c100 -d40 -p10,
# warmup+measure — we keep -d10 x3 median to stay inside the time budget).
PIPE_SUBJECTS=(
  "raw-node|node apps/raw.ts"
  "raw-scriptc|./bin/raw-scriptc"
  "ch3-node|node apps/ch3.ts"
  "ch3-scriptc|./bin/ch3-scriptc"
  "fmw-node|node apps/fmw.mjs"
  "fastify-node|node apps/fastify.mjs"
  "h3-node|node apps/h3.mjs"
  "hono-node|node apps/hono.mjs"
  "express-node|node apps/express.mjs"
)

FILTER=("$@")

want() {
  if [ "${#FILTER[@]}" -eq 0 ]; then return 0; fi
  local f
  for f in "${FILTER[@]}"; do [ "$f" = "$1" ] && return 0; done
  return 1
}

start_subject() {
  local name="$1" cmd="$2"
  # kill anything already on :3000
  for p in $(ss -tlnp 2>/dev/null | grep ':3000' | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u); do kill "$p" 2>/dev/null; done
  sleep 0.3
  # shellcheck disable=SC2086
  $cmd > "logs/$name.log" 2>&1 &
  SRV_PID=$!
  local i
  for i in $(seq 1 150); do
    curl -sf "$BASE/json" >/dev/null 2>&1 && return 0
    sleep 0.2
  done
  echo "  !! $name failed to start (see logs/$name.log)" >&2
  kill "$SRV_PID" 2>/dev/null
  echo "{\"subject\":\"$name\",\"error\":\"no-start\"}" >> "$RESULTS/_errors.jsonl"
  return 1
}

stop_subject() {
  kill "$SRV_PID" 2>/dev/null; wait "$SRV_PID" 2>/dev/null
}

ac_cell() {
  local name="$1" cell="$2" rep="$3"
  case $cell in
    json)     node lib/ac-run.mjs --url "$BASE/json" -c 64 -d 6 ;;
    user)     node lib/ac-run.mjs --url "$BASE/user/42" -c 64 -d 6 ;;
    echo64)   node lib/ac-run.mjs --url "$BASE/echo" --method POST --body-size 64 -c 64 -d 6 ;;
    echo1k)   node lib/ac-run.mjs --url "$BASE/echo" --method POST --body-size 1024 -c 64 -d 6 ;;
    deep)     node lib/ac-run.mjs --url "$BASE/deep/a/b/c/d/e" -c 64 -d 6 ;;
    files)    node lib/ac-run.mjs --url "$BASE/files/a/b/c.txt" -c 64 -d 6 ;;
    missing)  node lib/ac-run.mjs --url "$BASE/missing" -c 64 -d 6 ;;
    mixed)    node lib/ac-run.mjs --url "$BASE" --preset mixed -c 64 -d 6 ;;
    root)     node lib/ac-run.mjs --url "$BASE/" -c 64 -d 6 ;;
    hello)    node lib/ac-run.mjs --url "$BASE/hello" -c 64 -d 6 ;;
    postuser) node lib/ac-run.mjs --url "$BASE/user" --method POST -c 64 -d 6 ;;
  esac | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const r=JSON.parse(d);r.subject='$name';r.cell='$cell';r.rep=$rep;console.log(JSON.stringify(r))})" >> "$RESULTS/$name.jsonl"
}

run_subject() {
  local name="$1" cmd="$2" cellset="$3" binpath="$4"
  want "$name" || return 0

  echo "===== $name ($cmd) ====="
  start_subject "$name" "$cmd" || return 1

  # warmup — discarded
  node lib/ac-run.mjs --url "$BASE/json" -c 16 -d 2 >/dev/null

  local cells
  if [ "$cellset" = ceil ]; then cells="json user echo64 echo1k root hello postuser"; else cells="json user echo64 echo1k deep files missing mixed root hello postuser"; fi

  for cell in $cells; do
    local reps=3
    [ "$cell" = json ] && reps=5   # headline cell: x5 median (noise mitigation)
    local rep
    for rep in $(seq 1 "$reps"); do
      ac_cell "$name" "$cell" "$rep"
      printf '  %s rep%d done\n' "$cell" "$rep"
    done
  done

  # RSS after 100k requests on /json
  node lib/ac-run.mjs --url "$BASE/json" -c 64 --amount 100000 >/dev/null
  sleep 0.5
  local rss
  rss=$(ps -o rss= -p "$SRV_PID" 2>/dev/null | tr -d ' ')
  echo "{\"subject\":\"$name\",\"rss_kb_after_100k\":${rss:-null}}" >> "$RESULTS/$name.meta.jsonl"
  stop_subject

  # cold start: spawn -> first 200, median of 10
  # shellcheck disable=SC2086
  node lib/coldstart.mjs 10 -- $cmd | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const r=JSON.parse(d);r.subject='$name';console.log(JSON.stringify(r))})" >> "$RESULTS/$name.meta.jsonl"

  # binary size
  if [ -n "$binpath" ] && [ -f "$binpath" ]; then
    echo "{\"subject\":\"$name\",\"binary_bytes\":$(stat -c%s "$binpath")}" >> "$RESULTS/$name.meta.jsonl"
  fi
  echo "===== $name done ====="
}

run_pipe_subject() {
  local name="$1" cmd="$2"
  want "$name" || return 0
  echo "===== $name json-p10 (fastify-parity) ====="
  start_subject "$name" "$cmd" || return 1
  node lib/ac-run.mjs --url "$BASE/json" -c 32 -d 2 -p 4 >/dev/null   # warmup, discarded
  local rep
  for rep in 1 2 3; do
    node lib/ac-run.mjs --url "$BASE/json" -c 100 -p 10 -d 10 \
      | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const r=JSON.parse(d);r.subject='$name';r.cell='json-p10';r.rep=$rep;console.log(JSON.stringify(r))})" >> "$RESULTS/$name.jsonl"
    printf '  json-p10 rep%d done\n' "$rep"
  done
  stop_subject
  echo "===== $name done ====="
}

for entry in "${SUBJECTS[@]}"; do
  IFS='|' read -r name cmd cellset binpath <<< "$entry"
  run_subject "$name" "$cmd" "$cellset" "$binpath"
done

for entry in "${PIPE_SUBJECTS[@]}"; do
  IFS='|' read -r name cmd <<< "$entry"
  run_pipe_subject "$name" "$cmd"
done

echo "all done -> $RESULTS/"
