#!/usr/bin/env node
// Generates route-module corpora for the plugin benches.
//
// Sizes: 10 / 100 / 1000 modules, each with a mixed shape of ~1 / ~5 / ~20
// routes (weighted so the aggregate covers literal paths, params, wildcards,
// middleware chains, mounts, and exactly one dynamic bail per file — the
// plugin must warn on it and leave that route to runtime registration).
//
// Output: bench/plugin/corpus/<size>/modNNN.ch3.ts (gitignored).
//
// Usage: node gen-corpus.mjs [sizes...]   e.g. node gen-corpus.mjs 10 100 1000

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outRoot = join(here, "corpus");

// Deterministic per-file route mix. i is the module index; keeps corpora
// byte-identical across regenerations so benches are comparable over time.
function moduleSource(i, size) {
  const routes = [];
  const count = i % 3 === 0 ? 1 : i % 3 === 1 ? 5 : 20;
  const base = i * 1000;
  for (let r = 0; r < count; r++) {
    const n = base + r;
    const shape = n % 8;
    if (shape === 0) {
      routes.push(`app.get('/lit${n}', (c) => c.json({ n: ${n} }))`);
    } else if (shape === 1) {
      routes.push(
        `app.get('/user${n}/:id', (c) => c.json({ id: c.req.param('id') }))`,
      );
    } else if (shape === 2) {
      routes.push(
        `app.post('/echo${n}', (c) => c.text(c.req.body()), { body: true })`,
      );
    } else if (shape === 3) {
      routes.push(`app.get('/files${n}/*', (c) => c.text(c.req.param('*') || ''))`);
    } else if (shape === 4) {
      // middleware chain: use + route under it
      routes.push(
        `app.use((c, next) => { c.header('x-mw${n}', '1'); next() })`,
      );
      routes.push(`app.get('/mwd${n}', (c) => c.text('mw'))`);
    } else if (shape === 5) {
      // mount: sub-router mounted under a literal prefix
      routes.push(`const sub${n} = createRouter()`);
      routes.push(`sub${n}.get('/health', (c) => c.json({ ok: true, n: ${n} }))`);
      routes.push(`sub${n}.get('/deep/:id', (c) => c.json({ deep: c.req.param('id') }))`);
      routes.push(`app.route('/api${n}', sub${n})`);
    } else if (shape === 6) {
      routes.push(
        `app.get('/q${n}', (c) => c.text(c.req.query('x') || ''))`,
      );
    } else {
      routes.push(`app.all('/any${n}', (c) => c.text(c.req.method))`);
    }
  }
  // exactly one dynamic bail per file
  const dyn = `const dyn${i} = '/dyn${i}'\napp.get(dyn${i}, (c) => c.text('dynamic'))`;
  return [
    `// corpus module ${i} of ${size} (generated — see gen-corpus.mjs)`,
    `import { createRouter } from './ch3.ts'`,
    ``,
    `export const app = createRouter()`,
    ``,
    ...routes,
    ``,
    dyn,
    ``,
    `app.notFound((c) => { c.status(404); c.text('nf${i}') })`,
    ``,
  ].join("\n");
}

// Barrel the plugin imports from: re-export the workspace ch3 source the same
// way fixtures/vite-app does, so the generated dispatch imports resolve.
const CH3_BARREL = `export * from '../../../packages/ch3/src/index.ts'\n`;

const sizes = process.argv.slice(2).map(Number).filter((n) => n > 0);
const list = sizes.length > 0 ? sizes : [10, 100, 1000];

for (const size of list) {
  const dir = join(outRoot, String(size));
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "ch3.ts"), CH3_BARREL);
  for (let i = 0; i < size; i++) {
    writeFileSync(join(dir, `mod${i}.ch3.ts`), moduleSource(i, size));
  }
  console.log(`corpus/${size}: ${size} modules`);
}
