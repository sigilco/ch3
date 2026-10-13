# RESULTS plugin: @ch3/unplugin dev/build impact + parser A/B

2026-10-13 · @ch3/unplugin 0.1.0 (commit-range 2305f71..8b9995f) · referenced from
`docs/unplugin.md`.

**Compare ratios, not absolutes**: wall-clock ms on one laptop, same session,
back-to-back on/off pairs. Absolute numbers carry host noise (see ENV below);
the deltas between on/off cells in the same run are the signal.

## Environment

- macOS 26.6.2, Apple M1, 8 GB
- node v24.21.0 (`--expose-gc` where noted), pnpm 12.11.2
- vite 7.3.7 (fixtures/vite-app), rollup 4.64.5
- parsers: classic = typescript 5.9.3 (tsc API); tsgo = typescript
  7.1.0-dev.20261012.1 nightly (`typescript/sync` + `typescript/ast`)
- Date of runs: 2026-10-13, both benches twice back-to-back (run 1 / run 2
  shown where they differ; medians are stable across runs here, single-user
  laptop, no other load).

## Harness

Self-contained scripts in `bench/plugin/` (committed):

- `gen-corpus.mjs`: deterministic corpora: 10 / 100 / 1000 route modules,
  each ~1 / ~5 / ~20 routes across literal paths, params, wildcards, body
  routes, middleware chains, mounts, plus exactly one dynamic bail per file
  (the plugin warns and leaves it to runtime). Output gitignored under
  `bench/plugin/corpus/`.
- `parser-ab.mjs`: A/B through the real seam (`extractModule` from
  packages/unplugin). Cold = fresh node process, require + parse of ALL
  modules (tsgo's server spawn amortized inside, the shape a build pays);
  warm = re-parse in-process, the watch-regen shape. Medians of 5 reps,
  `--expose-gc` + forced gc between reps. tsgo is resolved the same way
  `packages/unplugin/test/parser.test.ts` does: NODE_PATH pointing at a
  node_modules dir containing the nightly (derived from the workspace's
  `typescript-next` alias; the script re-execs its children with it set).
- `plugin-impact.mjs`: vite 7 on `fixtures/vite-app` plus a bench-local
  variant with the 1000-module corpus copied under `src/corpus/`. Plugin
  ON/OFF toggled via `CH3_PLUGIN_OFF=1` read by a bench-local
  `vite.bench.config.ts` wrapper that re-exports the fixture config.
  (i) `vite build` wall time, (ii) `vite dev` spawn → first HTTP 200 on
  `/src/main.ts` (vite's module URL; the fixture has no browser entry),
  (iii) watch: dev server up, append a new route to `src/routes.ch3.ts`,
  poll until `src/.ch3/routes.gen.ts` content changes. Medians of 5,
  random ports in 41000-48999, servers killed after each rep.

## Parser A/B (extractModule over corpus, ms; median of 5)

Run 1 / run 2 were within ~5% on every cell; run 1 shown.

| corpus | parser | cold: full walk | warm: re-parse all |
|---|---|---|---|
| 10 mods | classic | 4.4 | 5.9 |
| 10 mods | tsgo | 5.2 | 9.1 |
| 100 mods | classic | 21.3 | 37.4 |
| 100 mods | tsgo | 34.1 | 49.3 |
| 1000 mods | classic | 160.1 | 193.4 |
| 1000 mods | tsgo | 288.7 | 319.5 |

Speedup of classic vs tsgo (tsgo-time / classic-time, run 1 / run 2; >1 means tsgo slower):

| corpus | cold | warm |
|---|---|---|
| 10 mods | 1.18x / 1.11x | 1.54x / 1.45x |
| 100 mods | 1.60x / 1.64x | 1.32x / 1.44x |
| 1000 mods | 1.80x / 1.80x | 1.65x / 1.70x |

Read: classic is faster on every cell, and the gap grows with corpus size.
tsgo loses despite native parsing because each parse is a sync IPC round-trip
(Atomics.wait) plus client-side wire decode into RemoteNodes, while classic's
tsc parse is one in-process call. The 10-mod cold cell is the only place tsgo
is close (spawn amortized over few modules). Note these are wall times
through the whole seam; a faster native parser does not help if the client
round-trip dominates.

## vite build + dev startup (ms; median of 5)

| variant | build on | build off | Δ build | startup on | startup off | Δ startup |
|---|---|---|---|---|---|---|
| base (1 route module) | 499 | 476 | +23 | 410 | 409 | +1 |
| 1000-module corpus | 904 | 512 | +392 | 861 | 468 | +393 |

Raw reps, run 1 / run 2:

- base build on `[577, 499, 496, 495, 499]` / `[860, 617, 517, 500, 501]`:
  first rep sometimes high (esbuild/vite cold caches); median robust.
- base build off `[478, 476, 478, 468, 466]` / `[483, 479, 476, 469, 479]`
- 1000 build on `[1169, 907, 890, 888, 904]` / `[1102, 904, 892, 902, 895]`
- 1000 build off `[515, 512, 509, 507, 512]` / `[509, 512, 509, 510, 515]`
- base dev on `[388, 407, 411, 410, 410]` / `[420, 409, 405, 405, 410]`
- base dev off `[409, 409, 375, 410, 409]` / `[408, 407, 406, 407, 407]`
- 1000 dev on `[839, 887, 861, 851, 873]` / `[864, 850, 856, 866, 866]`
- 1000 dev off `[468, 468, 437, 470, 473]` / `[482, 483, 478, 490, 483]`

Read: on the base fixture (one route module, the realistic small app) the
plugin is free: +23 ms on a ~480 ms build, +1 ms on dev startup, both within
run-to-run noise. At 1000 route modules the plugin's buildStart walk + parse
+ emit costs ~390 ms on a ~510 ms build (~1.8x wall time) and roughly doubles
dev startup. That is the honest price of 1000 lowered modules on this host;
the per-module cost is ~0.4 ms (dominated by the classic parse numbers above,
not by the walk or emit).

Caveat: `vite dev` startup here is vite's ssr-environment dev server; the
probe hits the module URL, not an entry page, because this fixture is a
server app with no browser entry. Absolute startup numbers are not
comparable to a browser-facing vite app.

## Watch regen (edit → routes.gen.ts content change, ms; median of 5)

| plugin | median ms | reps ok |
|---|---|---|
| on | 26 (run 1) / 118 (run 2) | 5/5, 5/5 |
| off | no regen happens (plugin absent): unmeasurable by construction | |

Raw reps run 1 `[7, 26, 124, 12, 121]`, run 2 `[6, 19, 118, 124, 119]`.

Too bimodal to call a single number: the distribution splits into a fast mode
(6-26 ms: watchChange fires, module regenerates, content-compare passes) and
a slow mode (118-124 ms: vite's watcher batches/delays the event). Both runs
contain both modes in different proportions, so the median flips between 26
and 118 ms. What is safe to say: regen latency is at worst ~120 ms and at
best single-digit ms on a one-module edit; it never approached vite's own
rebuild cost in any rep.

With the plugin off there is nothing to measure: no gen file is produced or
updated (the app keeps working through runtime registration). That cell is a
gap by construction, not a measurement.

## Decision gate

Default stays `classic`. Flipping to `tsgo` requires ALL of:

1. Warm-reparse win: tsgo must beat classic on the warm re-parse column
   (the watch shape) at 100 and 1000 modules by a meaningful margin. Today it
   is 1.3x to 1.7x slower everywhere, so this gate is nowhere near met.
2. Full-walk win: tsgo must beat classic on cold full-walk at scale. Today it
   is 1.6x to 1.8x slower at 100-1000 modules, also unmet.
3. TS 7.1 stable shipped: the `typescript/sync` API is nightly-only
   (7.1.0-dev.20261012.1 here) and explicitly unstable. No flip before a
   stable release carries the subpath, re-verified against these numbers.

Judged against these numbers: the native compiler's parse speed does not
reach the plugin through the sync-client seam; the IPC round-trip and wire
decode dominate. Unless the seam moves (batch parse API, persistent decoded
ASTs), tsgo stays an experimental option, not a default.

## Gaps and caveats

- Watch-regen median is bimodal (see above); reported as a range, not a
  point.
- Plugin-off dev startup measures vite without the plugin at all, which also
  skips the `.ch3/` emit the app's compiled entry imports; dev mode serves
  the runtime path either way, so the delta stays an apples-to-apples
  plugin-cost measurement, but the off-cell app is not literally "the same
  app minus dispatch".
- No Windows/Linux/macOS-Intel coverage; single host, single session. Do not
  port absolute numbers to other machines; re-run the scripts.
- The 1000-module corpus is synthetic (generated, uniform shapes). Real
  route trees with heavier middleware graphs may parse slower per module;
  the corpus is reproducible via `gen-corpus.mjs` for comparison.
