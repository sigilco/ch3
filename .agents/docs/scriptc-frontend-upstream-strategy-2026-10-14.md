# Moving the needle: scriptc changes vs vendoring for a minimal frontend web server

Companion to `frontend-framework-feasibility-2026-10-14.md`. Answers: **what must change in scriptc**, **what we fix in chttp/npm packaging**, and **whether to vendor the compiler**.

## Define “minimal frontend web server” (product scope)

Not HonoX. A shippable v1 that matches chttp’s ELF pitch:

| Capability | Subset/runtime today | Blocker? |
| --- | --- | --- |
| HTML pages (escape + layout) | `@chttp/html` + `c.html` | **No** — probes compile 100% static |
| JSON for islands/hydration | `c.json` | **No** |
| Parallel async fragments | `Promise.all` on **`Promise<T>[]`** | **No** — tuple literal form fails; typed array works (`promise-all-typed.ts`) |
| Static assets (small/medium) | `readFileSync` + `c.header` + `c.text` | **No** — `static-files.ts` ELF smoke OK |
| Large assets / streaming | `createReadStream` | **Yes (scriptc)** — `node:fs` has no `createReadStream` export (SC0001) |
| `import { createRouter } from "@chttp/router"` ELF | `--npm-static @chttp/router` | **Yes (preflight)** — SC2013 inferred-surface typecheck; router **JS is 100% static** when analyzed alone |
| Full SSR framework (components, Suspense) | — | **Defer** — unplugin lowering; not a scriptc-only fix |

**Conclusion:** you can ship a **minimal frontend web server package** (chttp + html + static + islands docs) **without waiting on scriptc**, if you accept sync file reads and program-code / vite-elf layout for the router.

---

## What actually moves the needle (ranked)

### Tier 0 — chttp-side (no scriptc fork)

1. **Ship `@chttp/html` + `examples/ssr-islands`** using existing probes.
2. **Authoring guide:** `const jobs: Promise<string>[] = [a(), b()]; await Promise.all(jobs)` (documented in [scriptc limitations](https://scriptc.dev/docs/limitations); our `promise-all-ssr.ts` failure was tuple inference, not missing `Promise.all`).
3. **ELF app layout:** keep **program-code** `packages/router/src/index.ts` or **unplugin-scriptc** pipeline; do not rely on `--npm-static @chttp/router` until SC2013 is cleared (below).
4. **Optional SSG:** unplugin emits string concat (subset-exempt) — zero scriptc dependency.

### Tier 1 — upstream scriptc (minimal issues / small PRs)

These are the highest-leverage **compiler/runtime** asks for frontend serving. Each should ship a **minimal repro** from `probe/frontend-ssr/` and a **non-frontend** justification (static sites, CLI HTML tools, ax-style ports).

| # | Ask | User-visible win | Repro / evidence | Est. shape |
| --- | --- | --- | --- | --- |
| **S1** | **`fs.createReadStream` (+ pipe to `ServerResponse`)** | Stream `/assets/*` without buffering multi-MB JS | `stream-file.ts` → SC0001 | New `node:fs` lowering; likely medium |
| **S2** | **String loop codegen parity** (charCodeAt / append loops vs split/join) | HTML escape at scale; any string builder hot loop | `bench-escape.ts` — **~2.9×** ELF regression | Backend/codegen issue; small–medium |
| **S3** | **`--npm-static` preflight vs rich `.d.ts`** | `scriptc build app.ts --npm-static @chttp/router` works for real apps | `npm-static-probe.ts` SC2013; `scriptc coverage dist/esm/index.js` → router **100% static** | Type-inference / preflight PR or doc for package authors |
| **S4** | **`--provenance-sources` for `@chttp/router`** | Compile published TS from attested tarball, not inferred JS surface | Requires npm provenance on publish + retry build | Process + scriptc; experimental flag already exists |

**Not worth an upstream fight (workaround exists):**

- Tuple `Promise.all([p1, p2])` — use `Promise<T>[]`.
- `html(parts: string[])` — use `TemplateStringsArray`.
- Runtime component records — parallel arrays or build-time lowering.

### Tier 2 — framework-shaped (only if probes show demand)

- Streaming SSR / async iteration over fragment streams
- Builtin HTML escape intrinsic (only if S2 insufficient after codegen fix)
- JSX / template IR in scriptc core — **reject**; belongs in **@chttp/unplugin**, not the compiler

---

## SC2013 deep dive (biggest DX needle for “normal npm app → ELF”)

Observed behavior (scriptc 0.3.1):

- `scriptc coverage packages/router/dist/esm/index.js --npm-static @chttp/router` → **501/501 static**, package marked **static**.
- `scriptc build npm-static-probe.ts --npm-static @chttp/router` → **SC2013**: *program does not typecheck against inferred surface (type-only declarations and .d.ts type guards…)*.

So the blocker is **app ↔ declaration inference**, not router bytecode. Likely contributors in `@chttp/router` types: `createRouter` generics, handler context types, path literals, branded/`unique symbol` patterns, or type-only guards.

**Parallel tracks (pick both):**

1. **chttp PR:** add a **`scriptc build` smoke** in CI: tiny app importing **`@chttp/router` from npm tarball** with `--npm-static @chttp/router`; iterate `.d.ts` until preflight passes (may need `@scriptc/router-types` slim surface).
2. **scriptc issue:** attach repro + request clearer diagnostic listing **which declaration** breaks inference; optional escape hatch `--npm-static-force` when package coverage is 100% (controversial — use only if inference fix is slow).

**Do not block minimal frontend server on this** — vite-elf and relative `src/index.ts` already work.

---

## Vendoring scriptc — recommendation: **no full vendor; yes targeted upstream**

### Why not vendor/fork the compiler now

| Factor | Assessment |
| --- | --- |
| Existing policy | `.agents/decisions.md`: *unplugin emit-only; **scriptc stays consumer CLI*** |
| Cost | Rust compiler + multi-platform CLI binaries + release infra; duplicates Vercel/labs maintenance |
| Pinning already works | 0.3.1 pin + parity suites; chttp already landed subset-driven fixes in **upstream** 0.3.1 |
| Needle for v1 frontend | **Tier 0** needs **zero** compiler changes |
| Risk | Fork drift → repeat of 0.3.0 header-read miscompile class of bugs |

### When vendoring *would* make sense

- Upstream stops merging static-server lowerings (streams, npm-static) for **>1 release cycle** while chttp commits publicly to ELF-first frontend.
- Sigilco becomes primary scriptc maintainer (organizational, not technical).
- You need **private IR hooks** for template lowering in the compiler (prefer **unplugin** instead).

### Hybrid that *does* ship ASAP (recommended)

```
┌─────────────────────────────────────────────────────────────┐
│  @chttp/html + docs (subset)          → npm, no scriptc PR │
│  examples/ssr-islands (chttp ELF)     → program-code path │
│  unplugin SSG (optional)              → build-time only   │
├─────────────────────────────────────────────────────────────┤
│  scriptc upstream: S1 streams, S2 strings, S3 npm-static    │
│  chttp: slim types + provenance + npm-static CI smoke       │
└─────────────────────────────────────────────────────────────┘
```

Optional **short-term** accelerator without forking: **`@sigilco/scriptc` republish** that only bumps version after upstream merges + cherry-picks (thin wrapper, not a compiler fork). Same pins, faster npm tag for chttp CI.

---

## Draft GitHub issues (copy-ready)

### scriptc: `fs.createReadStream` for static HTTP asset serving

**Problem:** Static file servers cannot stream bodies; must `readFileSync` entire asset.

**Repro:** `probe/frontend-ssr/stream-file.ts` — `createReadStream` missing from `node:fs`.

**Success:** Pipe to `http.ServerResponse`; document interaction with chttp `Ctx.sent` / manual `writeHead`.

---

### scriptc: char-at string loop codegen regression vs split/join

**Problem:** Identical escape logic: Node ~parity; ELF charCodeAt loop ~2.9× slower than split/join.

**Repro:** `probe/frontend-ssr/bench-escape.ts`.

**Success:** Within ~1.2× of split/join for typical HTML escape loops, or documented builtin `String.replaceAll`/escape fast path.

---

### scriptc: `--npm-static` SC2013 when package JS is fully static

**Problem:** `@chttp/router` ships 100% static JS, but apps fail preflight on `.d.ts` inference.

**Repro:** `probe/frontend-ssr/npm-static-probe.ts` + coverage report on `dist/esm/index.js`.

**Ask:** Pinpoint failing types; document package-author rules; or compile from `--provenance-sources` when attestation present.

---

### chttp: npm-static ELF smoke for `@chttp/router`

**Problem:** README claims `--npm-static @chttp/router`; probe shows SC2013 for minimal app.

**Task:** CI job `scriptc build` on `examples/hello` with `--npm-static @chttp/router`; fix exports/types until green; enable npm provenance for `--provenance-sources`.

---

## Decision summary

| Question | Answer |
| --- | --- |
| Can we ship minimal frontend web server **now**? | **Yes** — Tier 0 (html + islands + sync static files + typed Promise.all). |
| Must we vendor scriptc? | **No** for v1. |
| What to push upstream? | **Streams (S1)**, **string codegen (S2)**, **npm-static inference (S3)** — three focused issues/PRs. |
| What to fix in chttp first? | **`@chttp/html`**, **npm-static/provenance smoke**, **docs** — unblocks DX without compiler fork. |
