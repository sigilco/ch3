import { html } from "../lib/html.ts";

const name = "Ada";
const page = html`<h1>Hello ${name}</h1>`;
console.log(page.s);
