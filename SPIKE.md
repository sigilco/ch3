# SPIKE — compiled-mode dispatch

Two-layer architecture spike for `@sigilco/ch3`: the same Hono-flavored
typed authoring API on top of a specialized request hot path, plus the
generated-dispatch seam (`docs/route-contract.md`) that the
Vite/unplugin transform emits code against.

Status: numbers below are medians of 3 × 6s autocannon runs at `-c64`
(same harness as `bench/run.sh` — `bench/spike.sh`), loopback on a shared
VM. Ratio vs `raw-node` is the signal, not absolute rps (±50% shared-VM
noise between runs).

## What the hot path does now (all in `src/index.ts`, no separate dir)

| optimization | mechanism |
|---|---|
| lazy request view | `ReqView` holds `(raw, qs, path)` only. Params are NOT extracted at match time — `matchPath` returns the route node; dispatch binds the entry's declared `(name, segIndex)` pairs + splat index to the view; `param()`/`'*'` materialize `segs[]` + decoded values on first read. Query keys are scanned lazily on `query()` calls. Body is `''` unless declared. |
| flattened middleware | `compose()` bakes `(middleware[], handler)` → one closure per route entry at registration. Dispatch calls `chain(c)` directly — no generic chain walker, no per-request snapshot construction. |
| specialized matcher | `matchPath`: zero-allocation DFS over the raw path string (explicit `Frame[]` stack — no recursion under eager instantiation). Children pushed wildcard→param→static so static pops first. Segment bounds via `segEndAt`/`segEq` char scans — no `path.split('/')` on the hot path. |
| declared-body rule | `opts.body: true` at registration is the ONLY body opt-in (deterministic — a call-site `ctx.body()` marker would need handler source introspection, impossible in the subset and non-deterministic). `findEntry` sets `body===1` only for write methods. Buffering skipped entirely otherwise — the app can declare a POST route that never touches the body and stays streaming. |
| generated dispatch | `app.withDispatch(d)` — `d: GenDispatch` (src/gen.ts). Tried FIRST on every request; `true` = handled, `false` = fall through to internal dispatch. Contract surface: `ReqView`, `_seedPm`, `_setBody`, `Ctx`, `_buffer`, `_guard`, `dec` — documented in `docs/route-contract.md` for the plugin agent. |

## Fence fixes forced by program-code `scriptc build`

`scriptc build app.ts` eagerly instantiates every method of an
instantiated class (unlike `--npm-static` which links lazily). core-v0
failed 3 ways; all fixed:

- SC2003 `(v as unknown) as string[]` in `header()` → rewritten to
  single-arm narrowing (`typeof v === 'string'` / `Array.isArray` arms
  narrowed separately).
- SC2001 `<P extends string>` value-parameter generics on the verb
  methods → replaced by `string` params + `RouteOpts` third arg. The
  typed-path literal inference now lives on `createRouter<T>()`'s method
  signature — same compile-time API surface for authors.
- `children: RouteNode[]` self-referencing record member → `children:
  number[]` indices into `App._nodes` (also avoids boxed `unknown[]`
  reads on the hot path).

## Results

Full table + methodology: `bench/RESULTS-compiled-mode.md`.

Median rps, scriptc (the target that matters):

| cell | v0 (--npm-static) | compiled (program-code) | compiled+gen | Δ v0→compiled |
|---|---|---|---|---|
| json | 72,512 | 91,360 | 92,821 | +26% |
| user :param | 59,723 | 96,715 | 97,173 | +62% |
| echo64 | 67,981 | 95,851 | 93,707 | +41% |
| echo1k | 55,275 | 73,891 | 95,104 | +34% (+72% w/ gen) |
| deep | 63,576 | 86,624 | 91,520 | +36% |
| files * | 55,765 | 95,893 | 94,571 | +72% |
| missing 404 | 61,376 | 96,544 | 88,171 | +57% |
| mixed 100rt | 28,677 | 91,115 | 89,867 | +218% |

`raw-scriptc` ceilings in the same run: 75.8-96.4k. The compiled
internal dispatch sits **at parity** (≥96%) on json/user/files/missing/
mixed — the ~18% router-overhead gap is closed except on deep (-9% vs
raw) and echo1k (-18%; body `buf` concat dominates, and the generated
path recovers it by skipping the route-table lookup: 95.1k).

Node deltas are flat (v0 ≈ compiled, ±8%) — V8 masks most of the old
waste; nothing regressed. RSS: scriptc binaries 3.7-4.0 MB (node
~105-133 MB).

### Per-optimization attribution

The cells isolate mechanisms rather than staged builds:

- **lazy params/ctx** → `user` cell: eager per-request param
  extraction + Context record allocation removed → +62% scriptc
  (+7% node — V8 escape analysis had already paid part of it).
- **char-scan matcher + parallel-array route table** → `mixed` cell:
  +218%. The old recursive trie walker + `path.split()` + per-request
  param map was catastrophic at 100 routes under eager instantiation;
  the zero-alloc DFS is nearly free. `deep` (+36%) and `missing`
  (+57%) confirm on other shapes.
- **flattened middleware** → folded into every cell's dispatch cost;
  not cleanly separable from the dispatch rewrite (see dead ends).
- **declared-body** → correctness gate, not a throughput win on these
  cells (echo declares `body: true` so it buffers as before); its perf
  value is letting body-free POST routes stay streaming and enabling
  the program-code compile.
- **program-code vs --npm-static** → the sleeper finding: the same
  compiled source runs 40-70% slower under `--npm-static` (58k vs 91k
  json). All prior scriptc baselines were npm-static numbers because
  core-v0 couldn't compile program-code — the reported ~18% overhead
  was inflated by link mode, not just router cost.

## What didn't work / dead ends

- **npm-static link path**: validated as a requirement but revealed as
  a throughput cliff (58k/22k vs 91k program-code). Serving is correct;
  treat it as a compatibility path only. Recommend documenting that
  production builds must be program-code.
- **Isolating middleware flattening**: a middleware-free `compose()`
  is one closure wrap; the old chain walker's cost is entangled with
  per-request ctx allocation in v0, so no honest single-number delta —
  the `missing` cell (+57%, 404 → default chain) is the closest proxy.
- **Generated dispatch is not a general speedup**: internal dispatch
  already matches it (and wins on `mixed`). Its value is the
  compile-time seam (precomputed route shapes, typed params) + the
  echo1k body-path win — documented in route-contract.md.
- **`DispatchFn` field over `GenDispatch` field**: storing the module
  as an object member type would risk eager-instantiation fencing; the
  function-typed `_gen` field + `withDispatch` closure is the
  subset-clean encoding (subclass override verified compiled).

## Alignment with vercel-labs/scriptc methodology

Their `benchmarks/runtime` measures identical workloads across runtimes
with byte-identical output verification plus startup/RSS. Our harness
measures rps per canonical cell + `rss_kb_after_100k` per subject — same
spirit (same app, byte-identical routes across node + scriptc binaries).
Startup-time comparison not in scope for this spike.
