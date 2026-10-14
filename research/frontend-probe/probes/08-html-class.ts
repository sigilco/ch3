import { html, raw } from "../lib/html.ts";

const inner = html`<em>Ada</em>`;
const page = html`<p>Hello ${inner}</p>`;
const injected = html`<p>${raw("<b>ok</b>")}</p>`;
console.log(page.s);
console.log(injected.s);
