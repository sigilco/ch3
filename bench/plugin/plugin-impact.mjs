#!/usr/bin/env node
// Dev/build impact of @ch3/unplugin in a real vite app.
//
// Three measurements, each with the plugin ON vs OFF (toggle via
// CH3_PLUGIN_OFF=1 read by the bench-local vite config wrapper
// vite.bench.config.ts, which imports the fixture's real config):
//
//   (i)   build   — `vite build` wall time (spawn → exit), median of 5.
//   (ii)  dev     — `vite dev` startup: spawn → first HTTP 200 on /json.
//   (iii) watch   — dev server up, append a comment to a *.ch3.ts module,
//                   measure until routes.gen.ts content changes (the plugin
//                   compares content before writing, so an unchanged emit is
//                   a no-op — the probe edits a file whose emit DOES change:
//                   it appends a new route each rep, then restores).
//
// Two corpus variants: the fixture as committed ("base", 1 route module) and
// the fixture with bench/plugin/corpus/1000 copied in as extra route modules
// ("1000", 1001 modules). Measured on a random high port; servers killed.
//
// Usage: node plugin-impact.mjs

import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..", "..");
const FIXTURE = join(REPO, "fixtures", "vite-app");
const BENCH_FIXTURE = join(here, "vite-app-1000");
const REPS = 5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// node on macOS: fetch is available. Use it for readiness probes.
async function get(url, timeoutMs = 2000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal });
    const body = await res.text();
    return { ok: res.status === 200, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: "" };
  } finally {
    clearTimeout(t);
  }
}

function median(list) {
  const s = [...list].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const p = spawn(cmd, args, {
      cwd: opts.cwd ?? FIXTURE,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...opts.env },
    });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => resolve({ code, ms: performance.now() - t0, out }));
  });
}

// ---- variant setup ---------------------------------------------------------

const CORPUS_1000 = join(here, "corpus", "1000");

function setupVariant() {
  // bench-local copy of the fixture with the 1000-module corpus wired in as
  // src/corpus/*.ch3.ts. The fixture's vite config needs no changes: the
  // plugin walks the root and picks up every *.ch3.ts under src/.
  rmSync(BENCH_FIXTURE, { recursive: true, force: true });
  cpSync(FIXTURE, BENCH_FIXTURE, {
    recursive: true,
    filter: (src) => !src.includes("node_modules") && !src.includes("/dist") && !src.includes("/.ch3"),
  });
  mkdirSync(join(BENCH_FIXTURE, "src", "corpus"), { recursive: true });
  cpSync(CORPUS_1000, join(BENCH_FIXTURE, "src", "corpus"), { recursive: true });
  // src/ch3.ts and the corpus barrel re-export the ch3 source via a relative
  // path rooted at the real fixture; rewrite them to the same absolute target
  // from the bench copy's depth.
  const fixBarrel = join(FIXTURE, "src", "ch3.ts");
  const barrelTarget = "packages/ch3/src/index.ts";  // import specifiers resolve from dirname(file): src/ch3.ts sits 4 dirs
  // under the repo here (bench/plugin/vite-app-1000/src), corpus barrel 5.
  writeFileSync(
    join(BENCH_FIXTURE, "src", "ch3.ts"),
    `export * from '../../../../${barrelTarget}'\n`,
  );
  writeFileSync(
    join(BENCH_FIXTURE, "src", "corpus", "ch3.ts"),
    `export * from '../../../../../${barrelTarget}'\n`,
  );
  // pnpm's .bin shims bake relative store paths into shell scripts — copying
  // them to a different depth breaks them. Don't copy node_modules at all:
  // the bench copy reuses the FIXTURE's node_modules wholesale via a single
  // top-level symlink (resolution walks up from cwd to find it).
  symlinkSync(join(FIXTURE, "node_modules"), join(BENCH_FIXTURE, "node_modules"), "junction");
}

const VARIANTS = [
  { name: "base (1 route module)", dir: FIXTURE, probeRoute: "/json" },
  { name: "1000-module corpus", dir: BENCH_FIXTURE, probeRoute: "/json" },
];

// (i) build ------------------------------------------------------------------

async function benchBuild(dir) {
  const res = {};
  for (const off of [false, true]) {
    const times = [];
    for (let i = 0; i < REPS; i++) {
      rmSync(join(dir, "dist"), { recursive: true, force: true });
      const r = await run("pnpm", ["exec", "vite", "build", "--config", "vite.bench.config.ts"], {
        cwd: dir,
        env: off ? { CH3_PLUGIN_OFF: "1" } : {},
      });
      if (r.code !== 0) throw new Error(`build failed in ${dir} (off=${off}): ${r.out.slice(-800)}`);
      times.push(r.ms);
    }
    res[off ? "off" : "on"] = times;
  }
  return res;
}

// (ii) dev startup -----------------------------------------------------------

function spawnDev(dir, off, port) {
  const t0 = performance.now();
  // vite 7 on this host binds the hostname late; --host + localhost probing
  // proved reliable in manual runs (127.0.0.1 refuses for ~seconds).
  const p = spawn(
    "pnpm",
    ["exec", "vite", "dev", "--host", "--port", String(port), "--strictPort", "--config", "vite.bench.config.ts"],
    {
      cwd: dir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...(off ? { CH3_PLUGIN_OFF: "1" } : {}) },
    },
  );
  let out = "";
  p.stdout.on("data", (d) => (out += d));
  p.stderr.on("data", (d) => (out += d));
  return { p, t0, out: () => out };
}

async function benchDevStartup(dir, port) {
  const res = {};
  for (const off of [false, true]) {
    const times = [];
    for (let i = 0; i < REPS; i++) {
      const { p, t0 } = spawnDev(dir, off, port);
      // poll until first 200 (vite ssr dev serves the app through the plugin
      // pipeline; with plugin off the app still runs on runtime routing)
      const url = `http://localhost:${port}/src/main.ts`;
      for (;;) {
        const r = await get(url, 500);
        if (r.ok) break;
        if (performance.now() - t0 > 120_000) {
          p.kill("SIGKILL");
          throw new Error(`dev never ready (off=${off})`);
        }
        await sleep(25);
      }
      times.push(performance.now() - t0);
      p.kill("SIGTERM");
      await sleep(400); // let the port free
    }
    res[off ? "off" : "on"] = times;
  }
  return res;
}

// (iii) watch regen ----------------------------------------------------------

async function benchWatch(dir, port) {
  const target = join(dir, "src", "routes.ch3.ts");
  const genFile = join(dir, "src", ".ch3", "routes.gen.ts");
  const original = readFileSync(target, "utf8");
  const res = {};
  for (const off of [false, true]) {
    const { p, t0 } = spawnDev(dir, off, port);
    const url = `http://localhost:${port}/src/main.ts`;
    for (;;) {
      const r = await get(url, 500);
      if (r.ok) break;
      await sleep(25);
    }
    const times = [];
    try {
      for (let i = 0; i < REPS; i++) {
        // append a NEW route so the emit provably changes (content-compare
        // would no-op a comment-only edit on purpose)
        const marker = `// bench-watch ${i} ${Date.now()}\napp.get('/bw${i}', (c) => c.text('bw${i}'))\n`;
        const before = existsSync(genFile) ? readFileSync(genFile, "utf8") : "";
        const t1 = performance.now();
        // route append goes before the notFound registration
        const src = readFileSync(target, "utf8");
        const cut = src.lastIndexOf("app.notFound");
        const mutated = src.slice(0, cut) + marker + src.slice(cut);
        const fs = await import("node:fs");
        fs.writeFileSync(target, mutated);
        // until gen content changes (plugin on). With plugin off, gen never
        // changes — that cell is the documented gap (no regen to measure).
        let changed = false;
        for (let polls = 0; polls < 4000; polls++) {
          await sleep(5);
          try {
            const now = readFileSync(genFile, "utf8");
            if (now !== before) {
              changed = true;
              break;
            }
          } catch {}
          if (performance.now() - t1 > 30_000) break;
        }
        times.push(changed ? performance.now() - t1 : null);
        // restore before next rep (also a watch event; settle)
        fs.writeFileSync(target, original);
        await sleep(700);
      }
    } finally {
      p.kill("SIGTERM");
      const fs = await import("node:fs");
      fs.writeFileSync(target, original);
      await sleep(300);
    }
    res[off ? "off" : "on"] = times;
  }
  return res;
}

// ---- config wrapper ---------------------------------------------------------

// The wrapper must live where vite resolves plugins relative to cwd, so write
// it into both variant dirs. It re-exports the fixture config with the plugin
// removed when CH3_PLUGIN_OFF=1.
const WRAPPER = `import { defineConfig } from 'vite'
const base = (await import('./vite.config.ts')).default
export default defineConfig({
  ...base,
  plugins: process.env.CH3_PLUGIN_OFF === '1' ? [] : base.plugins,
})
`;

async function main() {
  if (!existsSync(CORPUS_1000)) {
    console.error("corpus/1000 missing — run gen-corpus.mjs first");
    process.exit(1);
  }
  const port = 41000 + Math.floor(Math.random() * 8000);

  const req = createRequire(join(FIXTURE, "package.json"));
  const viteVersion = JSON.parse(
    readFileSync(req.resolve("vite/package.json"), "utf8"),
  ).version;

  setupVariant();
  const { writeFileSync } = await import("node:fs");
  writeFileSync(join(FIXTURE, "vite.bench.config.ts"), WRAPPER);
  writeFileSync(join(BENCH_FIXTURE, "vite.bench.config.ts"), WRAPPER);

  const results = {};
  for (const v of VARIANTS) {
    results[v.name] = {
      build: await benchBuild(v.dir),
      dev: await benchDevStartup(v.dir, port),
    };
  }
  // watch only on base variant (single-module regen is the dev-loop shape)
  results["watch regen (base)"] = { watch: await benchWatch(FIXTURE, port + 1) };

  // ---- render ---------------------------------------------------------------
  const fmtMs = (t) => (t == null ? "no-op (no plugin)" : t.toFixed(0));
  console.log("### vite plugin impact (ms; median of " + REPS + "; vite " + viteVersion + ")");
  console.log("");
  for (const v of VARIANTS) {
    const b = results[v.name].build;
    console.log(`| ${v.name} | build on | build off | startup on | startup off |`);
    console.log(`|---|---|---|---|---|`);
    console.log(
      `|  | ${fmtMs(median(b.on))} | ${fmtMs(median(b.off))} | ` +
        `${fmtMs(median(results[v.name].dev.on))} | ${fmtMs(median(results[v.name].dev.off))} |`,
    );
    console.log("");
  }
  const w = results["watch regen (base)"].watch;
  const onTimes = w.on.filter((t) => t != null);
  console.log("### watch regen (edit → routes.gen.ts content change)");
  console.log("");
  console.log("| plugin | median ms | reps ok |");
  console.log("|---|---|---|");
  console.log(
    `| on | ${onTimes.length ? median(onTimes).toFixed(0) : "n/a"} | ${onTimes.length}/${REPS} |`,
  );
  console.log(
    `| off | no regen happens (plugin absent) — by construction unmeasurable | |`,
  );
  console.log("");
  // raw reps for noise inspection
  console.log("raw reps (ms):");
  for (const v of VARIANTS) {
    console.log(
      `  ${v.name} build on [${results[v.name].build.on.map((x) => x.toFixed(0)).join(", ")}] off [${results[v.name].build.off.map((x) => x.toFixed(0)).join(", ")}]`,
    );
    console.log(
      `  ${v.name} dev   on [${results[v.name].dev.on.map((x) => x.toFixed(0)).join(", ")}] off [${results[v.name].dev.off.map((x) => x.toFixed(0)).join(", ")}]`,
    );
  }
  console.log(
    `  watch on [${w.on.map((x) => (x == null ? "timeout" : x.toFixed(0))).join(", ")}]`,
  );

  // cleanup bench artifacts
  rmSync(BENCH_FIXTURE, { recursive: true, force: true });
  rmSync(join(FIXTURE, "vite.bench.config.ts"), { force: true });
  rmSync(join(FIXTURE, "dist"), { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  rmSync(BENCH_FIXTURE, { recursive: true, force: true });
  rmSync(join(FIXTURE, "vite.bench.config.ts"), { force: true });
  process.exit(1);
});
