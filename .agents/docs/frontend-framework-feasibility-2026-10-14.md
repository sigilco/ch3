# Frontend library / framework on chttp + scriptc — worktree probe (2026-10-14)

Worktree: `/tmp/chttp-worktrees/frontend-explore` (`cursor/frontend-explore-2eb1`).

Reproducible probes: `probe/frontend-ssr/` (scriptc 0.3.1, program-code builds).

## Executive answer

| Ship as… | Verdict | Why |
| --- | --- | --- |
| **Runtime `@chttp/html` helper** (escape + tagged templates + `raw()`) | **Yes (S)** | Compiles 100% static; integrates with `createRouter` + `c.html`; see live ELF smoke below. |
| **Islands recipe** (static shell + `<script type="module">` → JSON routes) | **Yes (S)** | No framework; server stays subset-clean; client is Vite/bundler (not ELF). |
| **SSG prerender pass** (unplugin emits static HTML at build) | **Yes (M, build-only)** | Same extraction model as route lowering; no runtime contract change. |
| **Full SSR metaframework** (components, partial composition, Suspense/streaming) | **No as a library today** | Composition + perf + subset fences push SSR to **compiler lowering**, not runtime APIs. Hydration always splits the “same source → ELF” story. |

This aligns with the parallel research synthesis: **adjuncts and recipes first; framework last (if ever).**

## What we verified (not guessed)

### 1. End-to-end SSR page in a scriptc ELF using chttp

- Source: `probe/frontend-ssr/server-chttp.ts` (imports `../../packages/router/src/index.ts` program-code, same as `bench/apps/chttp.ts`).
- Build: `scriptc build server-chttp.ts -o /tmp/probe-ssr-server --optimization=speed`
- Coverage: **669/669 statements static (100%)**
- Smoke:
  - `GET /?name=chttp` → full HTML document via tagged template + `c.html`
  - `GET /api/count` → JSON alongside the page route

**Composition pitfall (real):** interpolating a prebuilt HTML string into `html\`…${body}…\`` **auto-escapes** the partial (`<h1>` → `&lt;h1&gt;`). Fix for a runtime helper: **`raw()` trusted slot** (`html-raw.ts`) — compiles and prints `<div><strong>bold</strong> safe</div>`.

### 2. Escape implementation cliff (ELF vs Node)

`bench-escape.ts` — 50k iterations, ~2k char sample:

| Runtime | charCodeAt loop | split/join | Ratio (charCode / splitJoin) |
| --- | ---: | ---: | ---: |
| Node 22 | 606 ms | 593 ms | ~1.02× |
| scriptc ELF | 1290 ms | 445 ms | **~2.90×** |

**Implication:** any shipped `@chttp/html` in the subset must default to **split/join** (or codegen that emits literal concat), not per-code-unit loops.

### 3. Tagged templates in the subset

- `html(parts: string[])` → **SC0001** (`TemplateStringsArray` ≠ `string[]`).
- `html(parts: TemplateStringsArray, …)` → **compiles** (`html-tag.ts`, 32/32 static).

Authors need the correct signature; a published package should export the typed tag function as the public API.

### 4. “No component model” — nuance

- **Route/trie records:** chttp already avoids function-valued fields (parallel arrays on `App`) — this is the hard production constraint.
- **Probe `component-record-run.ts`:** a plain `{ render: () => string }` record **does compile and run** in isolation. Do not read this as “components work in records”; read it as **registry tables still want the parallel-array idiom** for anything on the hot path or beside route metadata.
- **Parallel-array registry** (`components-parallel-array.ts`) matches chttp’s own encoding and compiles cleanly.

### 5. Async SSR shapes

| Pattern | scriptc build | Notes |
| --- | --- | --- |
| Sequential `await` then concat | **OK** (`async-stream-fail.ts` — name is historical; it succeeds) | Fine for simple pages |
| `Promise.all([…])` + indexed read | **SC2002** (`promise-all-ssr.ts`) | Tuple/array width coercion fails |
| Streaming / Suspense-style join | **Not probed to success** | Expect codegen or sequential await only |

### 6. Islands (no framework)

`islands-shell.ts` — static HTML + inline module fetch of `/api/data`. ELF serves shell and JSON; browser runs module JS. **Works unchanged**; differentiation remains server-side (tiny binary), not client runtime.

### 7. `--npm-static @chttp/router` for SSR app

`server-chttp.ts` with package import → **SC2013** (inferred surface from declarations only). Production ELF apps must **vendor program-code** (`packages/router/src/index.ts`) or use the vite-elf pipeline — same as bench.

## What to build (ranked)

### Tier A — ship (days)

1. **`@chttp/html` (or `packages/html`)** — subset-only:
   - `escapeHtml` (split/join)
   - `html` tagged template + `raw()` slot record `{ kind, s }` (no function fields in records)
   - Tests in Node; one scriptc smoke test in CI mirroring `probe/frontend-ssr/html-raw-demo.ts`
2. **Docs recipe: islands** — static shell + JSON routes on existing `c.json` / `c.html` (no new runtime).
3. **Optional:** promote `probe/frontend-ssr/` to a documented `examples/ssr-islands` when product wants a template.

### Tier B — build-side (weeks, no route-contract bump)

4. **`@chttp/unplugin` SSG pass** — like route extractors, evaluate template literals in `.chttp.ts` handlers and emit prerendered strings (subset-exempt TypeScript in the plugin). Keeps ELF path as “string concat you can see.”
5. **Template lowering plugin** — parse tagged templates at build time → string concat + escape calls in emitted handler bodies (frozen internal contract, not `route-contract.md`).

### Tier C — defer

6. **Hydration, client components, Suspense, HonoX-style file routing for UI** — client code is not scriptc; server-side Suspense needs promise patterns the subset rejects. Market evidence from research still applies (HonoX stall, TanStack Start timeline).

## Relationship to backend adjunct roadmap

Frontend Tier A is **parallel and cheap** and does not block `@chttp/env` → OpenAPI → typed client. The only shared surface is **optional** unplugin extraction infrastructure (Tier B).

## Reproduce

```bash
cd probe/frontend-ssr
export PATH="$PWD/../../examples/vite-elf/node_modules/.bin:$PATH"
# requires: pnpm install --allow-build scriptc in examples/vite-elf

scriptc build server-chttp.ts -o /tmp/probe-ssr-server --optimization=speed
scriptc build bench-escape.ts -o /tmp/probe-bench && /tmp/probe-bench
node --experimental-strip-types bench-escape.ts

scriptc build promise-all-ssr.ts -o /tmp/x 2>&1   # expect SC2002
scriptc build html-raw-demo.ts -o /tmp/probe-raw && /tmp/probe-raw
```

## Kills / non-goals confirmed

- **Runtime JSX/component tree** in the ELF without a compiler pass.
- **Promise.all-based parallel SSR** as an authoring pattern in subset sources (use sequential await or build-time concat).
- **Competing with full metaframeworks** on client UX while solo-maintained — server ELF story does not translate to client differentiation.
