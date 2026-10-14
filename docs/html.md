# HTML rendering

`@chttp/html` renders HTML strings inside the scriptc compilable subset, so server side rendering works in a compiled chttp binary. It is independent of `@chttp/router`: it only produces strings you hand to `c.html(...)`. Names follow [kitajs/html](https://github.com/kitajs/html) where the subset allows; the audit is in `.agents/notes/2026-10-14-kitajs-api-audit.md`.

## API

| Export | Signature | Notes |
| --- | --- | --- |
| `escapeHtml` | `(s: string) => string` | Escapes `& < " '` to `&amp; &lt; &#34; &#39;`, same bytes as kitajs. Charcode loop, no regex |
| `h` | `(tag: string, attrs: string[], kids: string[]) => string` | `attrs` is a flat `[name, value, ...]` array. Void elements self close |
| `createElement` | `(name: string, attrs: string[], ...children: string[]) => string` | kitajs shaped alias of `h` |
| `Fragment` | `(kids: string[]) => string` | Siblings without a wrapper |
| `html` | tagged template | Escapes interpolations, static text is trusted markup |
| `raw` | tagged template | No escaping, for composing already rendered markup |
| `BARE` | `string` | Attribute value sentinel for bare boolean attributes |
| `isVoidElement`, `isValidTag`, `isValidAttrName` | `(s: string) => boolean` | Exposed helpers |

```ts
import { BARE, escapeHtml, h, html } from "@chttp/html";

function Todo(props: { text: string; done: boolean }): string {
  return h("li", ["class", props.done ? "done" : "open"], [escapeHtml(props.text)]);
}

app.get("/todos", (c) =>
  c.html(
    h("ul", [], [Todo({ text: "<b>ship</b>", done: false })]) +
      h("input", ["disabled", BARE, "value", "x"], []),
  ),
);
```

## Escaping model

Like kitajs, children are pre-rendered markup and are not escaped by `h`: a string child cannot be told apart from a nested element. Escape text yourself with `escapeHtml`, or write it with the `html` tag, which escapes every interpolation. A `safe` attribute pair escapes the joined children once (`h("p", ["safe", "true"], [userText])`) and is not emitted. Attribute values are always escaped. Tag and attribute names are validated and an invalid name throws, so a user controlled key cannot inject an attribute.

Differences from kitajs on purpose: the `html` tag escapes only interpolations (kitajs `escape` escapes the whole string, static text included), attribute values escape `&`, `<`, `"` and `'` (kitajs escapes only `"`), and there are no attribute objects, async children, or function typed element names.

## Namespace form

`import * as Html from "@chttp/html"` gives kitajs style call sites (`Html.escapeHtml`, `Html.createElement`, `Html.Fragment`). It lowers like `import * as v from "@chttp/val"`. A namespace object of functions would be a function-in-record, which the subset bans, so there is no default export.

## JSX in dev and tests

`@chttp/html/jsx-runtime` (and `jsx-dev-runtime`) export `jsx`, `jsxs`, `Fragment` and a `JSX` namespace so `"jsx": "react-jsx"` with `"jsxImportSource": "@chttp/html"` works under Node. Output is produced by `h()`, so it is byte identical to the same tree written with `h`. JSX props map to attrs (`className` to `class`, `true` to a bare attribute, `false`, `null` and `undefined` skipped, `safe` honoured). This runtime is not in the subset and must never be imported by code that compiles to the ELF. Production builds will lower `.tsx` to plain `h`/`html` calls at build time (planned unplugin `jsx` slice).

## Compile gate

`scriptc coverage bench/apps/chttp-html.ts` must report 100% static. `pnpm --filter @chttp/html test` runs the unit tests, the XSS payload cases, and the jsx-runtime equivalence test.
