// autocannon wrapper — prints one JSON line with the metrics we record.
// Usage:
//   node lib/ac-run.mjs --url http://127.0.0.1:3000/json -c 64 -d 6
//   node lib/ac-run.mjs --url .../echo --method POST --body-size 64 -c 64 -d 6
//   node lib/ac-run.mjs --url BASE --preset mixed -c 64 -d 6
//   node lib/ac-run.mjs --url .../json -c 100 -p 10 -d 10        (fastify-parity)
//   node lib/ac-run.mjs --url .../json -c 64 --amount 100000   (RSS run)
// autocannon reports a fixed percentile set (p50/p90/p97_5/p99/p99_9) — there
// is no p95; the wrk2 fixed-rate pass in run-latency.sh supplies true p95.
import autocannon from "autocannon";
import { mixedWorkload } from "../apps/common.mjs";

const args = process.argv.slice(2);
const opt = { connections: 64, duration: 6, method: "GET" };
let bodySize = 0,
  preset = null,
  amount = 0;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--url") opt.url = args[++i];
  else if (a === "-c" || a === "--connections") opt.connections = Number(args[++i]);
  else if (a === "-d" || a === "--duration") opt.duration = Number(args[++i]);
  else if (a === "-p" || a === "--pipelining") opt.pipelining = Number(args[++i]);
  else if (a === "--method") opt.method = args[++i];
  else if (a === "--body-size") bodySize = Number(args[++i]);
  else if (a === "--preset") preset = args[++i];
  else if (a === "--amount") amount = Number(args[++i]);
}

if (preset === "mixed") {
  opt.requests = mixedWorkload();
} else {
  if (bodySize > 0) {
    opt.body = "x".repeat(bodySize);
    opt.headers = { "content-type": "text/plain" };
  }
}
if (amount > 0) {
  opt.amount = amount;
  delete opt.duration;
}

const res = await autocannon(opt);
console.log(
  JSON.stringify({
    rps: res.requests.average,
    reqs: res.requests.total,
    p50: res.latency.p50,
    p90: res.latency.p90,
    p97_5: res.latency.p97_5,
    p99: res.latency.p99,
    p99_9: res.latency.p99_9,
    max: res.latency.max,
    mbps: res.throughput.average / 1048576,
    errors: res.errors,
    timeouts: res.timeouts,
    non2xx: res.non2xx,
    mismatches: res.mismatches,
    resets: res.resets,
  }),
);
