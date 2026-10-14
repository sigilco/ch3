// One ELF: CSR static files, kitajs sync SSR, escaping MVP, SSG literal, ISR cache.
import { createRouter } from "../../packages/router/src/index.ts";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "./vendor/kitajs-html.js";
import { el, esc, page } from "./mvp-html.ts";

const ROOT = import.meta.dirname;
const PUBLIC = join(ROOT, "public");
const app = createRouter();

function mime(p: string): string {
  if (p.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }
  if (p.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (p.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  if (p.endsWith(".svg")) {
    return "image/svg+xml";
  }
  return "application/octet-stream";
}

function readPublic(urlPath: string): string | null {
  if (urlPath.indexOf("..") >= 0) {
    return null;
  }
  const abs = join(PUBLIC, urlPath);
  if (!existsSync(abs)) {
    return null;
  }
  return readFileSync(abs, "utf8");
}

const SSG_HTML = page("ssg", el("body", el("h1", esc("built into the binary"))));

let isrHtml = "";
let isrAt = 0;

function Card(props: { title: string }): string {
  return createElement("section", null, createElement("h1", { safe: true }, props.title)) as string;
}

app.get("/", (c) => {
  const html = readPublic("index.html");
  if (html === null) {
    return c.text("missing index");
  }
  c.res.statusCode = 200;
  c.res.setHeader("content-type", "text/html; charset=utf-8");
  c.res.end(html);
  c.sent = true;
  return c;
});

app.get("/assets/*", (c) => {
  const rel = c.req.param("*");
  let name = "";
  if (rel !== null) {
    name = rel;
  }
  const body = readPublic("assets/" + name);
  if (body === null) {
    return c.status(404).text("not found");
  }
  c.res.statusCode = 200;
  c.res.setHeader("content-type", mime(name));
  c.res.end(body);
  c.sent = true;
  return c;
});

app.get("/ssg", (c) => {
  return c.html(SSG_HTML);
});

app.get("/ssr", (c) => {
  let name = c.req.query("name");
  if (name === null) {
    name = "world";
  }
  const body = el("body", el("h1", "Hello " + esc(name)));
  return c.html(page("ssr", body));
});

app.get("/isr", (c) => {
  const now = Date.now();
  if (isrHtml === "" || now - isrAt > 2000) {
    isrAt = now;
    isrHtml = page("isr", el("body", el("p", esc("rendered " + String(now)))));
  }
  return c.html(isrHtml);
});

app.get("/kita", (c) => {
  let name = c.req.query("name");
  if (name === null) {
    name = "world";
  }
  const inner = createElement(Card, { title: name }) as string;
  const doc = createElement(
    "html",
    null,
    createElement("body", null, inner, createElement("script", { src: "/assets/app.js", type: "module" })),
  ) as string;
  return c.html("<!doctype html>" + doc);
});

app.get("/*", (c) => {
  const html = readPublic("index.html");
  if (html === null) {
    return c.text("missing index");
  }
  c.res.statusCode = 200;
  c.res.setHeader("content-type", "text/html; charset=utf-8");
  c.res.end(html);
  c.sent = true;
  return c;
});

app.serve({ port: 3860 });
