import { createServer } from "node:http";

const json = (res, obj) => {
  res.statusCode = 200;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(obj));
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;
  if (req.method === "GET" && path === "/json") {
    json(res, { ok: true, value: 1 });
    return;
  }
  const m = path.match(/^\/user\/([a-zA-Z0-9_-]+)$/);
  if (req.method === "GET" && m) {
    json(res, { id: m[1] });
    return;
  }
  if (req.method === "POST" && path === "/echo") {
    const chunks = [];
    req.on("data", (c) => { chunks.push(String(c)); });
    req.on("end", () => {
      res.statusCode = 200;
      res.setHeader("content-type", req.headers["content-type"] || "application/octet-stream");
      res.end(chunks.join(""));
    });
    return;
  }
  res.statusCode = 404;
  res.end("not found");
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => console.log(`bare listening on ${port}`));
