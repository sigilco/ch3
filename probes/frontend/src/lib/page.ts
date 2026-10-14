import { attr, cat, el, elAttr, raw, text, type Html } from "./html.ts";

// Static shell + one client island. The island source is a string literal
// served to the browser; scriptc never parses it as a program.
const ISLAND = raw(
  '<p id="msg">loading</p>' +
    '<script type="module">' +
    'const el = document.getElementById("msg");' +
    'const res = await fetch("/api/count");' +
    "const data = await res.json();" +
    'el.textContent = "count " + data.n;' +
    "</script>",
);

export function countPage(name: string): Html {
  const who = el("h1", text("Hello " + name));
  const safe = elAttr("p", 'data-user="' + attr(name) + '"', text(name));
  return cat([
    raw("<!doctype html><html><head><meta charset=\"utf-8\"><title>probe</title></head><body>"),
    who,
    safe,
    ISLAND,
    raw("</body></html>"),
  ]);
}
