#!/usr/bin/env node
// Parser A/B: classic (typescript 5.x tsc API) vs tsgo (typescript/sync on a
// 7.x nightly), through the real seam (packages/unplugin extractModule).
//
// Two phases per corpus size:
//   cold — fresh `node` process: require the parser stack, then parse+extract
//          ALL corpus modules once (server spawn amortized inside the tsgo
//          run; that is the shape a build pays).
//   warm — same process, re-parse+extract every module again (the watch-mode
//          regen shape). Median of REPS runs.
//
// tsgo resolution mirrors packages/unplugin/test/parser.test.ts: the test
// only sees the nightly when NODE_PATH points at a node_modules dir that
// contains a `typescript` package with the `typescript/sync` subpath. This
// script derives that dir from the workspace's typescript-next alias and
// re-execs itself with NODE_PATH set, so `node parser-ab.mjs` just works.
//
// Emits a markdown table on stdout. medians of REPS reps, gc between reps
// when --expose-gc is available.
//
// Usage: node parser-ab.mjs [sizes...]        (default 10 100 1000)

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..", "..");
const UNPLUGIN_PKG = join(REPO, "packages", "unplugin", "package.json");
const REPS = 5;

// ---- locate the nightly the way parser.test.ts does (NODE_PATH) -----------

function nightlyNodeModulesDir() {
  // packages/unplugin/node_modules/typescript-next is a pnpm symlink to the
  // real nightly package dir; its parent node_modules is what NODE_PATH needs.
  const req = createRequire(UNPLUGIN_PKG);
  try {
    const pkgDir = dirname(req.resolve("typescript-next/package.json"));
    return join(pkgDir, "..");
  } catch {
    return null;
  }
}

const TSGO_ENV_DIR = nightlyNodeModulesDir();
const CHILD_ENV = {
  ...process.env,
  CH3_PARSER_AB_CHILD: "1",
  ...(TSGO_ENV_DIR ? { NODE_PATH: TSGO_ENV_DIR } : {}),
};

if (process.env.CH3_PARSER_AB_CHILD !== "1") {
  // parent: one child node process per (size, parser) for the cold number,
  // then drive the warm reps in that same child.
  const sizes = process.argv.slice(2).map(Number).filter(Boolean);
  const sizeList = sizes.length ? sizes : [10, 100, 1000];

  const rows = [];
  for (const size of sizeList) {
    const dir = join(here, "corpus", String(size));
    if (!existsSync(dir)) {
      console.error(`corpus/${size} missing — run gen-corpus.mjs first`);
      process.exit(1);
    }
    for (const parser of ["classic", "tsgo"]) {
      if (parser === "tsgo" && !TSGO_ENV_DIR) {
        console.error("tsgo: typescript-next alias not resolvable; skipping");
        continue;
      }
      const r = spawnSync(
        process.execPath,
        [
          "--expose-gc",
          fileURLToPath(import.meta.url),
          "--child",
          String(size),
          parser,
        ],
        { encoding: "utf8", env: CHILD_ENV, timeout: 600_000 },
      );
      if (r.status !== 0 || !r.stdout.trim()) {
        console.error(
          `child failed (${size}/${parser}): ${(r.stderr || "").slice(0, 400)}`,
        );
        process.exit(1);
      }
      rows.push({ size, parser, ...JSON.parse(r.stdout.trim()) });
    }
  }

  // ---- render -----------------------------------------------------------
  const fmt = (ms) => (ms == null ? "n/a" : ms.toFixed(1));
  console.log("### parser A/B (extractModule over corpus, ms; median of " + REPS + ")");
  console.log("");
  console.log("| corpus | parser | cold: full walk | warm: re-parse all |");
  console.log("|---|---|---|---|");
  for (const size of sizeList) {
    const cl = rows.find((r) => r.size === size && r.parser === "classic");
    const tg = rows.find((r) => r.size === size && r.parser === "tsgo");
    if (cl) console.log(`| ${size} mods | classic | ${fmt(cl.cold)} | ${fmt(cl.warm)} |`);
    if (tg) console.log(`| ${size} mods | tsgo | ${fmt(tg.cold)} | ${fmt(tg.warm)} |`);
  }
  console.log("");
  console.log("Ratios (tsgo / classic; >1 means tsgo slower) per size:");
  for (const size of sizeList) {
    const cl = rows.find((r) => r.size === size && r.parser === "classic");
    const tg = rows.find((r) => r.size === size && r.parser === "tsgo");
    if (cl && tg) {
      console.log(
        `  ${size} mods: cold ${(tg.cold / cl.cold).toFixed(2)}x, warm ${(tg.warm / cl.warm).toFixed(2)}x`,
      );
    }
  }
  process.exit(0);
}

// ---- child: measure one (size, parser) ------------------------------------

const gc = typeof globalThis.gc === "function" ? globalThis.gc : null;
const [, , , sizeArg, parserArg] = process.argv;
const size = Number(sizeArg);
const parser = parserArg;

// import the unplugin source directly (TS via node's strip-types path, same
// as the package's own tests: node --test test/*.test.ts)
const { extractModule } = await import(
  join(REPO, "packages", "unplugin", "src", "extract.ts")
);

const dir = join(here, "corpus", String(size));
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".ch3.ts"))
  .sort();
const sources = files.map((f) => ({
  name: join(dir, f),
  code: readFileSync(join(dir, f), "utf8"),
}));

function extractAll() {
  let lowered = 0;
  for (const s of sources) {
    const m = extractModule(s.name, s.code, { parser, imports: ["./ch3.ts"] });
    lowered += m.routes.length;
  }
  return lowered;
}

// sanity: both parsers must agree on route counts (extraction equivalence)
const lowered = extractAll();

// cold includes this process's require() of the parser stack (the tsgo
// server spawn happens on first parse), so time the whole first walk.
const t0 = performance.now();
extractAll();
const cold = performance.now() - t0;

// warm: the seam stays loaded, server already up — the watch shape.
const warm = [];
for (let i = 0; i < REPS; i++) {
  if (gc) gc();
  const s = performance.now();
  extractAll();
  warm.push(performance.now() - s);
}
warm.sort((a, b) => a - b);
const warmMedian = warm[Math.floor(warm.length / 2)];

process.stdout.write(
  JSON.stringify({ lowered, cold, warm: warmMedian, reps: warm }) + "\n",
);
