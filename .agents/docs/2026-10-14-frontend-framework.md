---
tags:
- chttp
- scriptc
- frontend
- html
- ssr
- islands
---

# Can we ship a frontend library/framework on chttp + scriptc?

Status: **probed on scriptc 0.3.1**, 2026-10-14. Repro: `research/frontend-probe/`.
Not a package release. This is the compile/serve evidence for whether a frontend
surface belongs next to `@chttp/router`.

## Verdict

**Ship a library. Do not ship a metaframework.**

A tagged-template HTML helper with a branded `Html` value, attribute helpers,
function components that return `Html`, class components, recursive string-tag
trees, `Promise.all` of fragments, `res.write` chunked HTML, and a chttp islands
app all compiled **100% static** and the ELFs matched Node byte-for-byte on the
probe outputs. The islands binary is **559 KB**, RSS **2.4 MB**, and it served
escaped HTML plus a JSON island endpoint.

A React/Preact-shaped runtime — `type: string | Function` VNodes, JSX without a
pre-transform, `Map` of components, and Suspense-style `string | Promise<string>`
children — does **not** compile. Client hydration still never touches scriptc
(Vite would bundle it), which severs the "same source → ELF" thesis for that
half of a framework.

That is enough to ship `@chttp/html` plus an islands recipe. It is not enough to
start HonoX/TanStack Start.

## What was actually compiled

Toolchain: scriptc **0.3.1**, Node **24.21.0**, program-code `scriptc build`
(default `--optimization=release`). Router imported from
`packages/router/src/index.ts` (same gate as `packages/router/test/smoke.ts`).
Every "works" row below is 100% static coverage **and** an ELF whose stdout
matched `node --experimental-strip-types` on the same file, except the HTTP
probes which were curled.

| Probe | Result | Why it matters |
|---|---|---|
| `html\`...\`` tagged template | **works** | Tag must be `(strings: TemplateStringsArray, ...values: Interpolable[])`. `string[]` is SC0001; `unknown[]` rest is SC2009. |
| `Html` class + `instanceof` | **works** | Nested templates do not double-escape; `raw()` opts out. Classes are the subset-legal brand. |
| Function components returning `Html` | **works** | `Layout(Hello("Ada"))` — no VNode required. |
| Class `render()` | **works** | Same class permission as `Ctx` / `VSchema`. |
| Function as parameter / in array / in a record | **works** | `registry.hello`, `fns[i]("Ada")`, `layout(() => ...)` all ELF-matched Node. The AGENTS.md "no function values in records" ban is a **router hot-path policy**, not a 0.3.1 refusal. |
| `{ path, fn }[]` on a class | **works** | Mini component/route table as records of functions compiles in a small program. |
| String-tag VNode + recursive `children: VNode[]` | **works** | Self-referential records are fine here (the router used index indirection for other reasons). |
| Discriminated node `{ kind, fn: Comp \| null }` | **works** | A real component tree is encodable without a `string \| Function` union. |
| `type: string \| Comp` VNode, then call | **refused SC2001** | This is the React/Preact vnode. `typeof n.type === "function"` does not produce a callable lowering. |
| `Map<string, Comp>` | **refused SC2009/SC2020** | No component registry via `Map`. |
| `string \| Promise<string>` child | **refused SC2009** | Suspense/streaming child model. |
| `Promise.all(Promise<string>[])` | **works** | Parallel async fragments are fine if the union never mixes sync and Promise. |
| `res.write` + `res.end` | **works** | Sync chunked HTML. Not progressive async streaming. |
| Object shorthand, object spread, `for...in` | **works** | 0.3.1 lowers them. Still banned in `packages/router/src` by policy. |
| JSX `<div/>` | **refused SC0001** | No `JSX.IntrinsicElements`, no `--jsx` on the scriptc CLI. JSX is a bundler pre-transform. |
| `...values: unknown[]` on the tag | **refused SC2009** | Rest arrays need a concrete element type. |
| Regex / `replaceAll` / split-join / `charCodeAt` escape | **works** | Regex ELF is 314 KB vs 101 KB for `replaceAll` (pulls in the regex engine). |
| Islands app (`c.html` + JSON + inline `<script type="module">`) | **works** | 100% static, 559 KB ELF, RSS 2408 KB, XSS query escaped. |
| Node-side SSG of the same helper | **works** | Subset-exempt. An unplugin pass would be this, not ELF work. |

Captured coverage dumps: `research/frontend-probe/.out/coverage/` (local; gitignored).
Re-run with `node research/frontend-probe/run.mjs` under Node ≥ 24 + `scriptc@0.3.1`.

## Corrections to the prior synthesis

The earlier ecosystem writeup claimed two hard results that 0.3.1 did not reproduce
as stated:

1. **"Function-valued records → no runtime component model."** Function fields in
   records, arrays, and class tables compiled and ran. What actually kills a
   React-like runtime is the **mixed** `string | Function` union at the call site
   (SC2001), plus `Map` of functions. A string-returning component library, and
   even a discriminated VNode, are subset-legal.
2. **"Per-char `charCodeAt` escaping is ~2× slower under ELF than Node; split/join
   is ~2× faster."** On this machine, 5000 iterations of a 2048-char dirty string:

   | runtime | split/join | charCodeAt |
   |---|---|---|
   | Node 24 | 315 / 278 / 321 ms | 88 / 89 / 82 ms |
   | ELF | 153 / 152 / 153 ms | 80 / 82 / 81 ms |

   ELF `charCodeAt` matched Node (≈0.9×). ELF split/join was ~2× **faster than Node
   split/join**, and still **slower than `charCodeAt`** on both runtimes. Absolute
   cost at page size is sub-millisecond either way. Prefer `charCodeAt` or
   `replaceAll` over regex (binary size).

Streaming/Suspense hostility **did** reproduce: mixed Promise arms are SC2009.
`Promise.all` of a homogeneous `Promise<string>[]` is fine. `res.write` of
already-computed chunks is fine.

## What a shippable `@chttp/html` looks like

Surface that compiled as `research/frontend-probe/lib/html.ts`:

```ts
html`<h1>Hello ${name}</h1>`          // interpolations escaped
html`<p>${inner}</p>`                 // inner: Html → not re-escaped
raw(`<script type="module">...</script>`)
joinHtml(items)                       // Html[] → Html (no array interpolation)
h("a", [["href", "/x"]], "Open")      // attr pairs; no for...in required
escapeHtml / escapeAttr
```

Constraints to keep the compile gate green (same spirit as `@chttp/val`):

- Rest values are `Interpolable = string | number | boolean | Html | null`.
  Not `unknown[]`. Not `Html[]` via interpolation — use `joinHtml`.
- Brand trusted markup with class `Html`, not `{ __html: string }`.
- Do not export a `Map`/`Record` of components as the public API. Export
  functions. (Records of functions compiled in isolation; they are the shape
  that poisoned large `App` instantiation historically. Do not make them the
  product.)
- No JSX in the library. If authors want JSX later, Vite/esbuild lowers it to
  `html`/`h` **before** `scriptc build` sees the file.
- Client islands are **strings** inlined into the ELF (`raw(\`<script type="module">…\`)`)
  or separate Vite assets. They are not compiled by scriptc. Tiny islands keep
  the single-binary story; a full hydration client does not.

`c.html(page.s)` is the only router hook. Do not touch `docs/route-contract.md`.
Literal `c.html("…")` already has static-send lowering; dynamic `html\`\`` stays
on the `Ctx.html` path, which is correct.

## Islands recipe (proved)

ELF served:

- `GET /` → HTML shell with `<span id="n">…</span>` and an inline module that
  `fetch("/api/count")`.
- `GET /api/count` → `{"n":42}`.
- `GET /xss?q=<script>alert(1)</script>` → the query is `&lt;script&gt;…` in the
  body. The island script itself is `raw()`, so it is not escaped.

`${` inside an `html\`\`` template is interpolation, so island JS that uses
template literals cannot live inside the tagged template. Keep client script in
a `raw()` string constant (or a separate asset). That is a DX footgun to
document, not a compiler bug.

## SSG

`research/frontend-probe/ssg.mjs` imported the same helper under Node and wrote
`index.html`. That is the whole unplugin-shaped pass: build-host, subset-exempt.
Literal `c.html` is already inlined by `@chttp/unplugin` static-send. SSG-to-files
is a deploy-mode for people who do not want a server; it does not strengthen the
ELF pitch and should stay optional.

## Framework vs library (product, not just subset)

Technically a small component runtime is possible (discriminated nodes, or skip
VNodes and return `Html`). Product-wise a metaframework is still the wrong next
package:

- Differentiation is server-side (559 KB ELF, 2.4 MB RSS). Metaframeworks
  differentiate on client routing, hydration, and DX around JSX/files.
- JSX and hydration require a Vite pipeline the ELF does not run.
- HonoX remaining v0.1 after years on a 74M-wk router is the cautionary tale;
  we would start from a much smaller core.
- `@chttp/val` is the adjunct template: subset-native, compile-gated, no
  contract bump.

## Recommended next packages (effort)

1. **`@chttp/html` (S)** — promote `lib/html.ts`, node:test suite, `scriptc coverage`
   gate on an app that imports router source + html (copy the val pattern:
   `bench/apps/chttp-html.ts` or extend the islands probe). Put it in the
   `versioning.fixed` group. Do not bump `ROUTE_CONTRACT_VERSION`.
2. **`examples/html-islands` (S)** — the 20-islands-app as a copyable example
   next to `examples/hello`. This is the demand probe.
3. **Docs recipe** — `docs/html.md`: escape, `Html` brand, islands, the `${`
   footgun, "no JSX in ELF".
4. **Optional, later:** unplugin JSX → `html`/`h` pre-transform; SSG file emit
   for staticSend routes. Only if (1)+(2) show pull.
5. **Do not:** streaming SSR framework, hydration runtime, file-based
   metaframework, Suspense, component `Map` registry.

Backend adjuncts from the ecosystem synthesis (`@chttp/env`, OpenAPI
side-channel, typed client) remain higher-ROI than anything in (4). Html is the
one frontend slice that is both subset-proven and small enough to ship beside
them.

## Platform risk

Keep the html compile gate as sacred as val's: `scriptc coverage` 100% on a
program-code app, plus an ELF curl of `/` and `/xss`. scriptc 0.3.0 already
miscompiled header reads into universal 500s. A tagged-template helper is a new
surface for that class of bug — parity with Node on escape + nested `Html` is
the regression suite.
