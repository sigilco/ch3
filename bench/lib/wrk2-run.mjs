// wrk2 wrapper — runs a fixed-rate pass and prints one JSON line.
// Usage:
//   node lib/wrk2-run.mjs --url http://127.0.0.1:3000/json -R 60000 -d 10 -c 64 -t 4
//   node lib/wrk2-run.mjs --url .../user -R 60000 -d 10 --post
// Emits { rps (achieved), target, p50, p95, p99, max (ms), mbps, errors, timeouts, non2xx }.
// Latency comes from wrk2's -L spectrum (corrected for coordinated omission) —
// p95 exists here, unlike autocannon's fixed percentile set.
import { spawnSync } from "node:child_process";
import { parseWrk2 } from "./wrk2-parse.mjs";

const args = process.argv.slice(2);
const opt = {
  url: null,
  rate: 0,
  duration: 10,
  connections: 64,
  threads: 4,
  post: false,
  wrk: process.env.WRK2 || "wrk2",
};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--url") opt.url = args[++i];
  else if (a === "-R" || a === "--rate") opt.rate = Number(args[++i]);
  else if (a === "-d" || a === "--duration") opt.duration = Number(args[++i]);
  else if (a === "-c" || a === "--connections") opt.connections = Number(args[++i]);
  else if (a === "-t" || a === "--threads") opt.threads = Number(args[++i]);
  else if (a === "--post") opt.post = true;
}
if (!opt.url || !opt.rate) {
  console.error("usage: wrk2-run --url U -R rate [-d 10] [-c 64] [-t 4] [--post]");
  process.exit(2);
}

const wrkArgs = [
  "-t",
  String(opt.threads),
  "-c",
  String(opt.connections),
  "-d",
  `${opt.duration}s`,
  "-R",
  String(opt.rate),
  "-L",
  "--timeout",
  "2s",
];
if (opt.post) wrkArgs.push("-s", new URL("./post.lua", import.meta.url).pathname);
wrkArgs.push(opt.url);

const r = spawnSync(opt.wrk, wrkArgs, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
if (r.status !== 0 && !r.stdout) {
  console.log(
    JSON.stringify({
      error: "wrk2-failed",
      status: r.status,
      stderr: (r.stderr || "").slice(-500),
    }),
  );
  process.exit(1);
}
const parsed = parseWrk2(r.stdout + "\n" + (r.stderr || ""));
parsed.target = opt.rate;
console.log(JSON.stringify(parsed));
