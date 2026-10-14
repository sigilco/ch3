# Four adversarial paths (scriptc 0.3.1, live ELF)

Probe: `probe/adv/`. Binary from `scriptc build server.ts --optimization=speed`: **905/905 static, 1.1MB**. Smoke on `:3860`.

## 1. Minimal scriptc surface

Most of a frontend server does not need a compiler change. The one change that would widen **existing** SSR libraries, and the one API that matters for large static files:

| Change | Unlocks | Evidence | Size |
| --- | --- | --- | --- |
| **Thenable check on untyped values.** `typeof x.then === "function"` is `yes` when `x` is typed `Promise`, and `fn-no object` when the same promise is an untyped parameter (`/tmp/then-unknown.js`). | Async children in `@kitajs/html` and any renderer that duck-types thenables. Sync rendering already works. | Node: `Promise.resolve` child → `<div>later</div>`. ELF: `Uncaught Error: Objects are not valid as a KitaJSX child`. | One semantic fix. Highest leverage. |
| **`fs.createReadStream` (or sendfile)** | CSR/SPA assets larger than you want to `readFileSync` on every request. | `probe/frontend-ssr/stream-file.ts` is SC0001. The CSR demo below does **not** need it. | One Node API. |
| Preact / React / Next `renderToString` | Per-request VDOM SSR | 93% static, then runtime `slice` of `undefined`. Fences: `for-in`, effectful `void`, dynamic record writes, nested captures, `document`, logical ops on unions, `Promise.resolve` at one instantiation (SC1052, SC1090, SC2020). | Not minimal. A language project. `--dynamic` does not exist in 0.3. |

Do not vendor scriptc for this list. The thenable fix and `createReadStream` are upstream issues. The VDOM list is not a PR series we should start in order to ship.

**chttp gap (not scriptc):** `c.html` / `c.text` always set `Content-Type`. A CSR bundle needs `text/javascript`. The probe writes `c.res.setHeader` + `c.res.end` and sets `c.sent = true`. A `c.body(s, contentType)` helper would be the small router change.

## 2. ELF serving a CSR build

`probe/adv/public/` is the shape of a separate Vite/React build: `index.html` plus `/assets/app.js` and `app.css`. The ELF does not execute the JS.

| Request | Result |
| --- | --- |
| `GET /` | `text/html`, the shell |
| `GET /assets/app.js` | `text/javascript` |
| `GET /assets/app.css` | `text/css` |
| `GET /assets/missing.js` | 404 `not found` (missing hashed assets do not fall through) |
| `GET /dashboard` | SPA fallback, same HTML as `/` |
| `GET /assets/../../server.ts` | 404 `not found` (does not return source) |

Gain vs Node static middleware: this process is the 1.1MB ELF (router + file reads + the other routes). No Node on the request path. Limit: whole file in memory per request until `createReadStream` exists. Fine for typical hashed bundles; wrong for multi‑MB media.

## 3. `@kitajs/html` vs an MVP

**Upstream PR (kitajs, not scriptc).** Stock 4.2.13 is 210/212 static and crashes at startup. Two packaging lines:

- CJS `exports.* = …` at the bottom of `index.js` (SC1090, runs at init).
- `if (typeof Bun !== "undefined") escapeHtml = Bun.escapeHTML`.

An ESM `export { … }` and deleting those lines is the patch. After that, sync `createElement` is **100% static**.

**Vendored copy:** `probe/adv/vendor/kitajs-html.js` (MIT, `@kitajs/html@4.2.13`, those lines removed). Wired to `GET /kita`.

- Sync function component `Card` renders.
- `{ safe: true }` escapes `<` in the title (`<script` → `&lt;script`). **Default children are not escaped**, on Node and on the ELF. Same XSS default as upstream.
- Async children throw on the ELF (section 1) and work on Node. Vendoring does not fix that.

**MVP alternative:** `probe/adv/mvp-html.ts` (`esc` / `el` / `page`), used by `GET /ssr`. `?name=<script>` → `Hello &lt;script&gt;`. Escapes by default. No `.then` path, so it cannot miscompile promises. This is the runtime to ship; kitajs is the authoring reference and the upstream packaging PR.

## 4. Server-side components (partial SSG / ISR / SSR) plus CSR

What the ELF actually does, and what it does not:

| Mode | Route | Behavior |
| --- | --- | --- |
| **SSG** | `/ssg` | HTML string literal baked into the binary. No renderer call. |
| **SSR** | `/ssr`, `/kita` | Sync render per request. `/kita` is a function component plus `<script type="module" src="/assets/app.js">` so the client bundle from section 2 hydrates nothing and mounts beside server HTML. |
| **ISR-shaped cache** | `/isr` | First request renders; a second request inside 2s returns the same `Date.now()` stamp. In-process TTL only. No background revalidate, no `stale-while-revalidate`, no multi-instance. |

Not in this binary: file-based pages, React/Preact server components, streaming, RSC, or hydration checksums. Those stay a Vite build (CSR or build-time SSG). Partial support means **sync string components on the server** and **a separately built client**, which is what `/kita` plus `/assets/*` is.

## What to push where

- **scriptc:** untyped thenable detection; `fs.createReadStream` when large assets show up. Not a Preact lowering project.
- **kitajs:** ESM build, no live `Bun` / `exports` bindings.
- **chttp:** `c.body(string, contentType)` so CSR MIME types are not a raw `ServerResponse` escape hatch; keep serving files in the app (or a tiny helper), not in the router core, until a second user needs it.
