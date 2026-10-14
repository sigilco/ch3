# Microframework (HonoX / Elysia / Waku class): native ELF vs hybrid

scriptc **0.3.1**. `--dynamic` is gone (native-only). A package that is 93–99% static still **builds**, then **throws at the first deferred site**. Partial coverage is not a runtime.

## What we ran

| Renderer | Coverage | ELF behavior |
| --- | --- | --- |
| **preact + preact-render-to-string** (`--npm-static`) | 339/363 (93%), 16 deferred (for-in, `void` in value position, dynamic keyed writes, nested captures) | Binary links (~905KB) then **`TypeError: slice of undefined`** — deferred fence, not a working SSR server |
| **hono/jsx** | 1532/1592 (96%), 94 deferred (`instanceof`, captures, …) | Not a viable native renderer |
| **@kitajs/html** (stock) | 210/212 (99%) | Crashes at init: CJS `exports.*` (SC1090). Second site is `typeof Bun` |
| **@kitajs/html mechanical ESM patch** (drop `exports.*`, skip `Bun`, strip JSX jsdoc) | **196/196 (100%)** | **Prints `<html><body><h1>hello</h1></body></html>`**. Binary **607KB** |
| **Iterative vnode walker written in the subset** | **40/40 (100%)** | Same HTML. Binary **110KB** |

So scriptc 0.3.1 **can** host a string-JSX page server. It **cannot** host stock Preact SSR. Small scriptc PRs do not close that gap: the missing pieces are language features (`for-in`, effectful `void`, dynamic record writes, closure captures), and there is no embedded JS engine left to hide them in.

## Which “frontend framework” is actually supportable

| Library | Role that works | Role that does not |
| --- | --- | --- |
| **String JSX (`@kitajs/html` shape, Elysia’s HTML plugin)** | **Server.** After an ESM packaging fix (kitajs PR or a ~500-line subset runtime we own), `createElement` → HTML runs **in the ELF**. JSX syntax is an esbuild/vite `jsxImportSource` in front of that runtime. | Streaming Suspense in kitajs (`renderToStream`) — not probed; assume hostile until proven |
| **Preact** | **Browser only.** Vite bundle, `<script type="module">`, islands that mount into empty roots, or hydrate **build-time** HTML | **Per-request SSR inside the ELF** on 0.3.1 |
| **Solid / React** | Same as Preact: client bundle or build-time SSG | Same: do not put `renderToString` on the native request path |
| **Hono `hono/jsx`** | Fine on Node/Bun | Not static enough for ELF |
| **Waku / RSC** | — | Server components + flight protocol. Out of subset; no gain vs running Waku on Node |

The honest product is **Elysia-HTML / Hono-without-HonoX**, not HonoX and not Waku: JSX that lowers to strings, optional Preact **in the browser**.

## Two architectures, and where the gain vs Node actually is

### 1. Native server (supported now, with a string runtime)

```
JSX  --vite jsxImportSource-->  subset createElement
                                      |
                                 chttp handler
                                      |
                                 scriptc ELF   (HTML + JSON)
Preact island JS  --vite client-->  static file the ELF serves (not executed by scriptc)
```

**Gain vs HonoX/Elysia on Node:** the process that answers HTTP is a ~1–4MB ELF (chttp + string renderer), cold start on the order of the existing chttp scriptc numbers (~3ms, a few MB RSS), not a Node/Bun process (tens of ms, tens–hundreds of MB). Preact never enters that process.

**No gain if** the request path still calls `preact-render-to-string` in Node and the ELF is only a proxy.

### 2. Hybrid that still wins: Preact at build time, ELF at runtime

```
vite build (Node): preact-render-to-string → HTML strings or files
runtime:           scriptc ELF serves those strings + /api JSON + /assets
browser:           Preact hydrates or mounts islands
```

**Gain:** production has no JS runtime. Per-request personalized HTML is limited to **slot fill** in the subset (`raw` / escape) or **client fetch**. Full per-request Preact SSR stays a Node build or a Node sidecar — a sidecar **erases the gain** on the HTML path.

### 3. Native Preact SSR (not supported)

Would be the only way to match HonoX’s authoring model **and** keep per-request component SSR inside the ELF. On 0.3.1 the binary crashes. Fixing it means scriptc grows general JS features **or** we rewrite `preact-render-to-string` into the subset and keep markup compatible with client Preact (a maintained fork). Neither is a minimal PR. Do not start the microframework on this path.

## What to ship if the goal is “one frontend, native server, real gain”

1. **Server runtime in-subset** (own `@chttp/html` `createElement`, or a kitajs ESM patch upstream). Proven 100% static.
2. **Vite `jsxImportSource`** pointing at that runtime so pages are authored as JSX.
3. **Preact (or Solid) as the client island runtime only**, built by Vite, served as static JS. Document “do not import `preact-render-to-string` from ELF entry.”
4. **File routes** as an unplugin that emits `app.get` + a render call. Build-time, no scriptc change.
5. **Optional SSG mode:** same JSX, but Vite pre-renders with a Node pass when a page opts into real Preact components, and the ELF only serves the result.

## What not to do

- Vendor scriptc to “make Preact compile.” The fences are in Preact’s JS, and 0.3 has no interpreter fallback.
- Ship a Node SSR microframework under the chttp name. That is HonoX/Elysia with no deploy advantage.
- Promise Waku-style RSC on the ELF.
