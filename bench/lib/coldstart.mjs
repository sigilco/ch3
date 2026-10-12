// Cold-start timer: spawn -> first HTTP 200 on /json, median of N reps.
// Usage: node lib/coldstart.mjs <reps> -- <cmd> [args...]
import { spawn } from "node:child_process";

const sep = process.argv.indexOf("--");
const reps = Number(process.argv[2] || 10);
const cmd = process.argv.slice(sep + 1);

const times = [];
for (let i = 0; i < reps; i++) {
  const t0 = performance.now();
  const child = spawn(cmd[0], cmd.slice(1), { stdio: "ignore" });
  let ms = -1;
  const deadline = t0 + 15000;
  while (performance.now() < deadline) {
    try {
      const r = await fetch("http://127.0.0.1:3000/json", { signal: AbortSignal.timeout(2000) });
      if (r.ok) {
        ms = performance.now() - t0;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 3));
  }
  times.push(ms);
  child.kill("SIGKILL");
  await new Promise((r) => child.once("exit", r));
  await new Promise((r) => setTimeout(r, 150));
}
const ok = times.filter((t) => t > 0).sort((a, b) => a - b);
const median = ok.length ? ok[Math.floor(ok.length / 2)] : -1;
console.log(
  JSON.stringify({
    reps: ok.length,
    median_ms: Math.round(median * 100) / 100,
    min_ms: Math.round((ok[0] ?? -1) * 100) / 100,
  }),
);
