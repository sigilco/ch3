import { createRouter } from "../../packages/router/src/index.ts";
import { createReadStream } from "node:fs";
import { join } from "node:path";

const app = createRouter();
const ROOT = import.meta.dirname;

app.get("/stream", (c) => {
  const stream = createReadStream(join(ROOT, "asset.txt"));
  c.res.writeHead(200, { "content-type": "text/plain" });
  stream.pipe(c.res);
  return c;
});

app.serve({ port: 3853 });
