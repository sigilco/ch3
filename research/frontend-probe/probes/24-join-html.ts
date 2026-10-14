import { html, joinHtml, Html } from "../lib/html.ts";

function item(name: string): Html {
  return html`<li>${name}</li>`;
}

const parts: Html[] = [item("a"), item("b"), item("c")];
const page = html`<ul>${joinHtml(parts)}</ul>`;
console.log(page.s);
