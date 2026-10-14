import { html, Html } from "../lib/html.ts";

function Hello(name: string): Html {
  return html`<h1>Hello ${name}</h1>`;
}

function Layout(body: Html): Html {
  return html`<!doctype html><html><body>${body}</body></html>`;
}

console.log(Layout(Hello("Ada")).s);
