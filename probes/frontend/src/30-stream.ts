import * as http from "node:http";

async function load(): Promise<string> {
  return "two";
}

async function handle(res: http.ServerResponse): Promise<void> {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.write("<p>one</p>");
  const rest = await load();
  res.write("<p>" + rest + "</p>");
  res.end();
}

const server = http.createServer(function (_req, res): void {
  handle(res);
});
server.listen(8766, "127.0.0.1");
