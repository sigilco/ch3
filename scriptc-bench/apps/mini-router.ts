import { createServer, IncomingMessage, ServerResponse } from "node:http";

type Handler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => void;

interface Route {
  method: string;
  segments: string[];
  handler: Handler;
}

const routes: Route[] = [];

function add(method: string, path: string, handler: Handler) {
  routes.push({ method, segments: path.split("/").filter((s) => s !== ""), handler });
}

function lookup(method: string, pathname: string): { handler: Handler; params: Record<string, string> } | null {
  const parts = pathname.split("/").filter((s) => s !== "");
  for (const r of routes) {
    if (r.method !== method || r.segments.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      const seg = r.segments[i];
      if (seg.startsWith(":")) params[seg.slice(1)] = parts[i];
      else if (seg !== parts[i]) { ok = false; break; }
    }
    if (ok) return { handler: r.handler, params };
  }
  return null;
}

function json(res: ServerResponse, obj: unknown) {
  res.statusCode = 200;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(obj));
}

add("GET", "/json", (req, res) => json(res, { ok: true, value: 1 }));
add("GET", "/user/:id", (req, res, params) => json(res, { id: params.id }));
add("POST", "/echo", (req, res) => {
  const chunks: string[] = [];
  req.on("data", (c) => { chunks.push(String(c)); });
  req.on("end", () => {
    res.statusCode = 200;
    res.setHeader("content-type", req.headers["content-type"] || "application/octet-stream");
    res.end(chunks.join(""));
  });
});

const server = createServer((req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  const hit = lookup(req.method || "GET", url.pathname);
  if (hit) {
    hit.handler(req, res, hit.params);
    return;
  }
  res.statusCode = 404;
  res.end("not found");
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => console.log(`mini-router listening on ${port}`));
