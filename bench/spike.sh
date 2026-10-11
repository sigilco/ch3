#!/usr/bin/env bash
# Focused spike runner — same cells/methodology as run.sh but for named
# subjects only. Usage:
#   bash bench/spike.sh out.jsonl "name|cmd|cellset" ...
# cellset: full = json user echo64 echo1k deep files missing mixed
#          ceil  = json user echo64 echo1k
set -u
cd "$(dirname "$0")"
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH:$HOME/bin:$HOME/.bun/bin"

BASE="http://127.0.0.1:3000"
OUT="$1"; shift
mkdir -p "$(dirname "$OUT")" logs

for entry in "$@"; do
  IFS='|' read -r name cmd cellset <<< "$entry"
  echo "===== $name ($cmd) ====="
  # kill anything already on :3000
  for p in $(ss -tlnp 2>/dev/null | grep ':3000' | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u); do kill "$p" 2>/dev/null; done
  sleep 0.3
  # shellcheck disable=SC2086
  $cmd > "logs/$name.log" 2>&1 &
  pid=$!
  ok=0
  for i in $(seq 1 150); do
    curl -sf "$BASE/json" >/dev/null 2>&1 && { ok=1; break; }
    sleep 0.2
  done
  if [ "$ok" = 0 ]; then
    echo "  !! $name failed to start (see logs/$name.log)" >&2
    kill "$pid" 2>/dev/null
    continue
  fi
  node lib/ac-run.mjs --url "$BASE/json" -c 16 -d 2 >/dev/null   # warmup, discarded
  cells="json user echo64 echo1k deep files missing mixed"
  [ "$cellset" = ceil ] && cells="json user echo64 echo1k"
  for cell in $cells; do
    for rep in 1 2 3; do
      case $cell in
        json)     node lib/ac-run.mjs --url "$BASE/json" -c 64 -d 6 ;;
        user)     node lib/ac-run.mjs --url "$BASE/user/42" -c 64 -d 6 ;;
        echo64)   node lib/ac-run.mjs --url "$BASE/echo" --method POST --body-size 64 -c 64 -d 6 ;;
        echo1k)   node lib/ac-run.mjs --url "$BASE/echo" --method POST --body-size 1024 -c 64 -d 6 ;;
        deep)     node lib/ac-run.mjs --url "$BASE/deep/a/b/c/d/e" -c 64 -d 6 ;;
        files)    node lib/ac-run.mjs --url "$BASE/files/a/b/c.txt" -c 64 -d 6 ;;
        missing)  node lib/ac-run.mjs --url "$BASE/missing" -c 64 -d 6 ;;
        mixed)    node lib/ac-run.mjs --url "$BASE" --preset mixed -c 64 -d 6 ;;
      esac | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const r=JSON.parse(d);r.subject='$name';r.cell='$cell';r.rep=$rep;console.log(JSON.stringify(r))})" >> "$OUT"
    done
  done
  node lib/ac-run.mjs --url "$BASE/json" -c 64 --amount 100000 >/dev/null
  sleep 0.4
  rss=$(ps -o rss= -p "$pid" 2>/dev/null | tr -d ' ')
  echo "{\"subject\":\"$name\",\"rss_kb_after_100k\":${rss:-null}}" >> "$OUT"
  kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null
  echo "===== $name done ====="
done
