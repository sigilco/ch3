# html AGENTS.md

`@chttp/html` is minimal HTML string rendering in the scriptc compilable subset. Independent of `@chttp/router` (no imports between them). Same subset rules as `packages/router/src` (see root AGENTS.md), plus what the probes found:

- **Strings only.** Children are pre-rendered markup (`string[]`), attributes are a flat `string[]` of name/value pairs. No `any`, no attribute objects, no `Promise` children, no `Children` unions, no function-typed element names. Components are plain `(props: T) => string` functions called directly.
- **No regex, no `s[i]`.** `out += s[i]` fails SC1090; use `charCodeAt` / `charAt` / `slice`. `escapeHtml` is a charCode loop.
- **Guard `T | undefined`.** Array indexing yields `string | undefined`; use an explicit `=== undefined` guard (a cast does not satisfy scriptc).
- **Named imports only**, no default imports. `import * as Html from "@chttp/html"` is the namespace form (matches kitajs `Html.escapeHtml`, `Html.createElement`, `Html.Fragment` call sites). No function-in-record namespace object.
- **Escape contract.** `escapeHtml` escapes `& < " '` to `&amp; &lt; &#34; &#39;` (kitajs bytes, `>` untouched). `h` never escapes kids (they are markup); attribute values are always escaped; a `safe` pair escapes the joined kids once. The `html` tag escapes interpolations only. `raw` is the explicit trusted-markup escape hatch. Invalid tag or attribute names throw.
- **`src/jsx-runtime.ts` is NOT subset.** It is Node-only (dev, tests) and delegates to `h()` so output is byte-identical. It must never be imported by anything that is compiled to an ELF, and it is not part of the coverage gate.
- **Gate:** `scriptc coverage bench/apps/chttp-html.ts` must stay 100% static (that file exercises every subset export). `pnpm --filter @chttp/html test` runs the node:test suite against the tsc build, including XSS payloads and the jsx-runtime equivalence test.
- The kitajs API audit with line refs is `.agents/notes/2026-10-14-kitajs-api-audit.md`.
