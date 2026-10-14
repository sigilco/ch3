// chttp + @chttp/html compile gate: `scriptc coverage bench/apps/chttp-html.ts` must stay 100% static.
// Exercises every export of the subset runtime.
import { createRouter } from "../../packages/router/src/index.ts";
import {
  BARE,
  Fragment,
  createElement,
  escapeHtml,
  h,
  html,
  isValidAttrName,
  isValidTag,
  isVoidElement,
  raw,
} from "../../packages/html/src/index.ts";

function Card(title: string, body: string): string {
  return h("section", ["class", "card"], [h("h2", [], [escapeHtml(title)]), body]);
}

const app = createRouter();

app.get("/page", (c) => {
  const q = c.req.query("q");
  const name = q === null ? "world" : q;
  const page = Fragment([
    h("meta", ["charset", "utf-8"], []),
    Card("hi " + name, html`<p>${name}</p>`),
    createElement("input", ["disabled", BARE, "value", name]),
    raw`<hr/>`,
    h("div", ["safe", "true"], ["<b>" + name + "</b>"]),
  ]);
  const ok = isValidTag("div") && isValidAttrName("data-x") && isVoidElement("br");
  return c.html(ok ? page : "");
});

app.serve({ port: Number(process.argv[2] || 3000) });
