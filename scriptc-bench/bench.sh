#!/usr/bin/env bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$HOME/.bun/bin:$PATH"
cd /home/ubuntu/scriptc-bench
PORT=3200

bench() {
  local name="$1"; shift
  PORT=$PORT timeout 20 "$@" > /tmp/srv.log 2>&1 &
  local pid=$!
  sleep 2
  autocannon -c 64 -d 6 -j "http://localhost:$PORT/json" > /tmp/ac.txt 2>/dev/null
  node -e "
    const fs=require('fs');
    const lines=fs.readFileSync('/tmp/ac.txt','utf8').trim().split('\n').filter(Boolean);
    const j=JSON.parse(lines[lines.length-1]);
    console.log('$name | rps='+Math.round(j.requests.average)+' p99ms='+j.latency.p99+' errs='+(j.errors||0)+' timeouts='+(j.timeouts||0));
  " 2>/dev/null || echo "$name | PARSE_FAIL $(tail -2 /tmp/srv.log)"
  kill $pid 2>/dev/null; wait $pid 2>/dev/null
  sleep 0.5
}

echo "=== scriptc native ==="
bench "scriptc/bare" ./bin/bare-static
bench "scriptc/mini-router" ./bin/mini-static
echo "=== node ==="
bench "node/bare" node apps/bare.js
bench "node/fmw" node apps/fmw.js
bench "node/polka" node apps/polka.js
bench "node/hono" node apps/hono.js
bench "node/h3" node apps/h3.js
echo "=== bun ==="
bench "bun/bare" bun apps/bare.js
bench "bun/fmw" bun apps/fmw.js
bench "bun/polka" bun apps/polka.js
bench "bun/hono" bun apps/hono.js
bench "bun/h3" bun apps/h3.js
