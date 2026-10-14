import { createRouter } from "../../../packages/router/src/index.ts";
import { html, raw } from "../lib/html.ts";

const ISLAND = raw(`<script type="module">
const el = document.getElementById("n");
const r = await fetch("/api/count");
const j = await r.json();
el.textContent = String(j.n);
</script>`);

function page(title: string, countHint: string) {
  return html`<!doctype html>
<html>
<head><title>${title}</title></head>
<body>
  <h1>${title}</h1>
  <p>count: <span id="n">${countHint}</span></p>
  ${ISLAND}
</body>
</html>`;
}

const app = createRouter();
app.get("/", function (c) {
  return c.html(page("islands", "…").s);
});
app.get("/api/count", function (c) {
  return c.json({ n: 42 });
});
app.get("/xss", function (c) {
  const q = c.req.query("q");
  const v = q === null ? "<script>alert(1)</script>" : q;
  return c.html(page("xss", v).s);
});

const port = Number(process.argv[2] || 18081);
app.serve({ port: port });
console.log("islands listening on :" + String(port));
