import { html, raw } from "./html-raw.ts";

const partial = "<strong>bold</strong>";
const doc = html`<div>${raw(partial)} ${"safe"}</div>`;
console.log(doc);
