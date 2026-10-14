# @chttp/html

Minimal HTML string rendering authored inside the scriptc compilable subset, so it compiles into a chttp native binary. Names follow [kitajs/html](https://github.com/kitajs/html) where the subset allows.

```ts
import { h, html, escapeHtml } from "@chttp/html";

const page = h("ul", ["class", "todos"], [
  h("li", [], [escapeHtml(userText)]),
  html`<li>${userText}</li>`,
]);
```

See the [html docs](https://github.com/sigilco/chttp/blob/main/docs/html.md).
