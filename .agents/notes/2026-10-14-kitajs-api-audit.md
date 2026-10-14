# kitajs/html API audit for @chttp/html (2026-10-14)

Source: `opensrc path kitajs/html` resolves to `~/.opensrc/repos/github.com/kitajs/html/next`, package `@kitajs/html` 5.0.0-next.1. All refs are `packages/html/src/<file>:<line>`. Goal: match public names and semantics where the scriptc subset allows, deviate loudly where it does not.

## Public surface and subset fit

| kita name | Ref | Semantics | Fits subset | @chttp/html decision |
|---|---|---|---|---|
| `escapeHtml(value: any)` | index.ts:107 | Escapes `& < " '` to `&amp; &lt; &#34; &#39;` (not `>`). Non-strings go through `.toString()`. Regex pre-test `ESCAPED_REGEX` at :6, `switch (value[end])` at :129, `Bun.escapeHTML` swap at :159 | Partly. `any` param, regex, `value[i]` indexing (SC1090 per probe) and the Bun swap do not fit | Keep name and output bytes. Signature `escapeHtml(s: string): string`, `charCodeAt` loop, `slice` flush, no regex, no `>` escaping (same output as kita) |
| `escape` tag (alias `e`) | index.ts:73, :628 | Concatenates ALL pieces and values, then escapes the whole string, so static template text is escaped too | Yes in shape, but semantics are a trap | `html` tag instead: escapes only interpolations, static text is trusted markup. Differs from kita on purpose (kita output for `<p>${x}</p>` would be `&lt;p&gt;...`) |
| `createElement(name, attributes, ...children)` (alias `h`) | index.ts:550, :615 | Function names are called with props; `tag`/`of` switches the element name (:571); void elements self-close `<br/>` (:578); children joined by `contentsToString` | Strings only. Function-typed `name`, `Function` unions, attribute objects (`object`, `for...in` at :306), `Promise` children (:428, :478) do not fit | `createElement(name: string, attrs: string[], ...children: string[])` and `h(tag, attrs, kids: string[])`. Attrs are a flat name/value array. No async children, no `tag`/`of`, components are plain `(props: T) => string` called directly |
| `attributesToString` | index.ts:296 | Skips `children`/`safe`/`of` (:308), `className` to `class` (:320), array classes (:327), style objects (:348), booleans bare (:363), Date (:380). Values escape only `"` (:390-415) | No: dynamic object keys, `typeof`, `instanceof Date`, `Array.isArray` on unions | Flat `string[]` pairs; values escape `& < " '` (stricter than kita's quote-only, so `<` in attribute values is also escaped). `class`/`style` are caller-built strings. Bare boolean attributes via the exported `BARE` sentinel value |
| `safe` attribute | jsx.ts:94-108, index.ts:584, :308 | Opt-in: children are NOT escaped by default; `safe` escapes the joined children once (`contentsToString(..., escape)` :491). Never emitted as an attribute | Yes | Same semantic. A `safe` pair in `h` attrs escapes joined kids once and is not emitted (`safe=false` disables). Default stays unescaped (children are pre-rendered markup, text must go through `escapeHtml`/`html`) |
| `Html.Fragment` | index.ts:608 | `contentsToString([props.children], props.safe)` | Props-record form fits, `Children` union does not | `Fragment(kids: string[]): string`, plain concatenation. jsx-runtime `Fragment(props)` keeps the kita shape (node only) |
| `Html` namespace | docs and README use `import Html from '@kitajs/html'`; source has no `Html` object export | Named exports only (index.ts) | A runtime namespace object of functions is a function-in-record, banned | Named exports; `import * as Html from "@chttp/html"` gives the same call sites (`Html.escapeHtml`, `Html.createElement`, `Html.Fragment`). `import * as` is already used by `@chttp/val` and lowers |
| `isVoidElement` | index.ts:167 | 16-name `===` chain | Yes | Same list and order, exported |
| `toKebabCase`, `styleToString` | index.ts:28, :196 | Style object to string | Object iteration, no | Skipped. Pass a ready `style` string |
| `contentsToString`, `contentToString` | index.ts:445, :507 | `splice` + spread flattening, Promise handling, throws on objects | No (`Children` union, `.then` read at :478 is the SC1090 trap, `splice(...spread)`) | Not exported. `string[]` kids are concatenated by a loop |
| `jsx`, `jsxs`, `Fragment` | jsx-runtime.ts:20, :65, :101 | Automatic runtime; `instanceof Promise` at :46 and :91 | Not subset (JSX is refused by scriptc) | Node-only `@chttp/html/jsx-runtime` re-implemented over `h()` rules, sync only |
| Suspense, ErrorBoundary | suspense.ts, error-boundary.ts | Streaming, async | No | Out of scope |

## Findings that shaped the design

1. Kita is unsafe by default: nothing is escaped unless `safe` is set (index.ts:584 passes `attributes.safe`). A string child cannot be told apart from nested markup, which is why. chttp keeps the same model for `h`/JSX and adds the `html` tag as the escape-by-default path.
2. Kita escapes `"` as `&#34;` and `'` as `&#39;`, not `&quot;`. The P0 probe used `&quot;`; the package follows kita bytes.
3. Kita attribute names are never validated (index.ts:366, :375, :395 interpolate `key` raw), so a user-controlled key is an attribute injection. @chttp/html validates names and tag names and throws.
4. Everything with `any`, object iteration, `typeof` dispatch, Promise children or regex is outside the subset (P0 case 5: `s[i]` fails SC1090, use `charAt`/`charCodeAt`).

## What fits

`escapeHtml`, `isVoidElement`, element rendering from flat string arrays, `Fragment`, the `safe` semantic, and the named-export call shape. What does not fit (object attrs, async children, function-typed element names, style objects) is replaced by plain-string conventions, or by the build-time JSX lowering slice (P4 step 4) for author ergonomics.
