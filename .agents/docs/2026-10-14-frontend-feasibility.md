# Frontend on chttp and scriptc (2026-10-14)

Question: can we ship a frontend library or framework on top of chttp (the project formerly named ch3) and/or scriptc?

Answer: a **server HTML library** can ship, and an **islands recipe** on that library already runs inside a chttp ELF. A **metaframework** (JSX, React, hydration from the same source, Suspense) cannot ship inside the binary.

Probes live in `probes/frontend`. Compiler is scriptc 0.3.1. Correctness binaries used `--optimization dev` except the escape bench and the thrown-promise release check, which used the default release build (`-O2`). Node on this machine is 22.14; the scriptc package asks for Node >= 24, and the native CLI still ran.

## What shipped in the probe

`src/lib/html.ts` is the conservative renderer: an `Html` class, `esc` via split/join (`&` first), `text` / `raw` / `el` / `cat`. `src/lib/page.ts` builds a document with one `<script type="module">` island that fetches `/api/count`.

`src/33-serve-island.ts` imports that page and `packages/router/src/index.ts`. scriptc coverage: **654/654 statements static**. The linked ELF is **842,592 bytes**. Against `http://127.0.0.1:8765`:

- `GET /` returns `text/html` with the shell and the island script.
- `GET /?name=A<B>"` escapes to `Hello A&lt;B&gt;&quot;` in both the text node and `data-user`.
- `GET /api/count` returns `{"n":3}` on two back-to-back requests.
- `GET /slow` is an async handler and returns the escaped page through chttp's existing settle path.
- Headless Chrome loaded `/` and the island replaced `loading` with `count 3` (`probes/frontend/out/island-dom.html`, not committed).

The same `countPage("A<B>")` bytes from Node and from `bin/print-page` were identical (`cmp`). A Node-only lowerer (`lower/lower.mjs`) turned `lower/home.view` into `src/gen/home.ts` (`"<h1>" + esc(title) + ...`). That generated module compiled and printed `PASS lowered`.

In-order streaming also compiled. `src/30-stream.ts` writes `<p>one</p>`, awaits a string, writes `<p>two</p>`. The ELF answered `Transfer-Encoding: chunked` with body `<p>one</p><p>two</p>`.

## Compiler results

Each row is one file. "ELF" means the binary was executed.

| Probe | Coverage | ELF runtime |
| --- | --- | --- |
| split/join `esc`, `Html` helpers, page | 100% | served, bytes match Node |
| tagged template, string values | 100% | PASS |
| tagged template, `Html` values | 100% | PASS |
| tagged template, `Html \| string` | 100% | PASS |
| function field on a record | 100% | PASS |
| class holds that record, called twice | 100% | PASS |
| function stored on a class field | 100% | PASS |
| function array | 100% | PASS |
| class `render()` method | 100% | PASS |
| recursive element tree | 100% | PASS |
| explicit-stack element tree | 100% | PASS |
| eager function components (`button()` returns `El`) | 100% | PASS |
| callback child (`list(items, row)`) | 100% | PASS |
| element record `{ type, label }` | 100% | PASS |
| element record `{ type(props: unknown), props: unknown }` | 100% | PASS |
| linear `async` page | 100% | PASS |
| `await` of `unknown` (string or promise) | 100% | PASS |
| `Promise.all` of fragments | 100% | PASS |
| `Map` / `Set` of strings | 100% | PASS |
| `?.`, `??`, spread, `string \| undefined` | 100% | PASS |
| regex `replace` escape | 100% | PASS |
| chunked `res.write` + `await` | 100% | body matches |
| chttp island server | 100% | curl + Chrome |
| lowered template | 100% | PASS |
| `string \| Promise<string>` return | 58% | build refused, SC2009 |
| `throw load()` then `await` the catch | 100% | **diverges** (below) |
| `import { createElement } from "react"` | 0% | SC2013, no interpreter fallback |
| JSX `<p>hello</p>` | not analyzable | scriptc does not apply `jsx` |

`string | Promise<string>` is still SC2009: "Promise arms have no home in a compiled union yet". A component return has to be a string, a promise, or `unknown` joined with `await`. Mixing the first two in one signature does not compile.

Thrown promises are the sharp runtime bug. Node prints `thrown-type=object` and `joined-type=string` and exits 0. The ELF, at both `-O0` and `-O2`, prints `joined-type=object` and exits 1. Coverage was 100%. A Suspense boundary that throws a promise would compile and then drop the resolved string.

JSX: `tsc -p probes/frontend/tsconfig.json` is clean with `"jsx": "react"`. scriptc 0.3.1 reports `Cannot use JSX unless the '--jsx' flag is provided` on the same file. Templates have to be lowered to string concatenation before scriptc sees them. The lowerer in this probe is that path, at toy scale.

React 19.2: with `@types/react` installed, coverage refuses the import as SC2013 (`cannot compile npm package '@types/react' statically`, "scriptc has no interpreter fallback") plus SC1090 on the `createElement` binding. There is no `--dynamic` escape hatch on this CLI.

## Escape cost

`src/31-escape-bench.ts`, release ELF vs Node, three runs, median. Sample is a 40× repeated sentence containing `& < > " '`, 20,000 iterations, `Date.now()`, checksum `n=50400000` on every run. This is a microbench on one VM, not a `bench/RESULTS-v2.md` cell.

| impl | ELF ms | Node ms |
| --- | --- | --- |
| split/join | 131 | 181 |
| charCodeAt | 338 | 166 |
| regex replace | 459 | 175 |

Under the ELF, charCodeAt is 2.6× split/join, and regex replace is 3.5× split/join. charCodeAt on the ELF is 2.0× the same loop on Node. split/join on the ELF is 1.4× the Node loop. The helper to ship is split/join.

## What this means for a package

Ship, when someone picks up the work:

- A small `@chttp` HTML module in the scriptc subset: `esc`, tagged `html`, eager functions that return strings or `Html`. Delivery stays `c.html(s)` on the router. No change to `docs/route-contract.md`.
- An islands recipe: the shell is that HTML, the client is a `<script type="module">` string (or a static file) that fetches JSON routes. The browser program is not scriptc input. Chrome already ran that split on the probe.
- SSG as a Node script that imports the same render module. Byte-identical output is already demonstrated.
- JSX or a `.view` template only as a Node/unplugin lowerer that emits the concatenation style in `src/gen/home.ts`.

Leave in the repo's stricter subset even though 0.3.1 also ran them: function-valued records, `Map`/`Set`, `?.` / `??`, and `undefined` unions. The router still bans function-valued records because that shape fenced route nodes under earlier scriptc, and 0.3.0 has already miscompiled a header read into universal 500s. A library that needs those features would have to re-prove them on every scriptc pin. The string API does not need them.

Do not start a framework that puts React, Preact, or Vue inside the ELF, that typechecks JSX with scriptc, or that suspends by throwing promises. Linear `async` rendering and in-order `res.write` are available; out-of-order Suspense is not. Client hydration staying in Vite is a permanent split: the ELF thesis covers the server renderer, and the island script is data.
