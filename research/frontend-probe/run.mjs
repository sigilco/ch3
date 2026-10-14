#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const probesDir = join(root, "probes");
const outDir = join(root, ".out");
mkdirSync(outDir, { recursive: true });
mkdirSync(join(outDir, "coverage"), { recursive: true });

const BUILD = new Set([
  "01-tagged-template",
  "03-fn-as-param",
  "04-fn-in-array",
  "05-class-component",
  "08-html-class",
  "10-promise-all",
  "15-attr-pairs",
  "18-res-write",
  "20-islands-app",
  "21-escape-bench",
  "22-template-strings-array",
  "23-nested-fn-components",
  "24-join-html",
  "25-recursive-vnode",
  "26-class-fn-record",
  "28-vnode-discriminated",
]);

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    timeout: opts.timeout ?? 180000,
    env: process.env,
    cwd: opts.cwd ?? root,
  });
  return {
    status: r.status,
    signal: r.signal,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    error: r.error ? String(r.error) : "",
  };
}

function scodes(text) {
  const set = new Set();
  const re = /\bSC\d{4}\b/g;
  let m;
  while ((m = re.exec(text))) {
    set.add(m[0]);
  }
  return [...set].sort();
}

const files = readdirSync(probesDir)
  .filter((f) => /\.(ts|tsx)$/.test(f))
  .sort();

const results = [];
for (const f of files) {
  const id = f.replace(/\.(tsx|ts)$/, "");
  const file = join(probesDir, f);
  console.log("== coverage " + id);
  const cov = run("scriptc", ["coverage", file], { timeout: 120000 });
  writeFileSync(join(outDir, "coverage", id + ".txt"), cov.stdout + "\n---stderr---\n" + cov.stderr);
  const codes = scodes(cov.stdout + "\n" + cov.stderr);
  const row = {
    id,
    file: f,
    coverageStatus: cov.status,
    coverageCodes: codes,
    coverageError: cov.error,
    built: false,
    buildStatus: null,
    buildCodes: [],
    buildError: "",
  };
  const looksClean =
    cov.status === 0 &&
    codes.length === 0 &&
    !/blocker|refused|error TS/i.test(cov.stdout + cov.stderr);
  if (BUILD.has(id) && looksClean) {
    const bin = join(outDir, id);
    console.log("== build " + id);
    const b = run("scriptc", ["build", file, "-o", bin], { timeout: 300000 });
    writeFileSync(join(outDir, "coverage", id + ".build.txt"), b.stdout + "\n---stderr---\n" + b.stderr);
    row.built = true;
    row.buildStatus = b.status;
    row.buildCodes = scodes(b.stdout + "\n" + b.stderr);
    row.buildError = b.error;
  } else if (BUILD.has(id)) {
    console.log("== skip build " + id + " (coverage not clean)");
  }
  results.push(row);
  console.log(
    "   status=" +
      String(cov.status) +
      " codes=" +
      (codes.join(",") || "none") +
      (row.built ? " build=" + String(row.buildStatus) : ""),
  );
}

writeFileSync(join(outDir, "summary.json"), JSON.stringify(results, null, 2));
console.log("wrote " + join(outDir, "summary.json"));
