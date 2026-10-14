// Islands recipe: static HTML shell + client module fetching JSON API

import { createRouter } from "../../packages/router/src/index.ts";
import { escapeHtmlSplitJoin } from "./html-escape.ts";

const app = createRouter();

const SHELL =
  '<!doctype html><html><body><div id="app">loading…</div>' +
  '<script type="module">' +
  "fetch('/api/data').then(r=>r.json()).then(d=>{" +
  "document.getElementById('app').textContent=JSON.stringify(d);" +
  "});" +
  "</script></body></html>";

app.get("/", (c) => {
  return c.html(SHELL);
});

app.get("/api/data", (c) => {
  return c.json({ message: "from ELF", ts: 1 });
});

app.serve({ port: 3849 });
