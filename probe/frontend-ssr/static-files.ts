import { createRouter } from "../../packages/router/src/index.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const app = createRouter();
const ROOT = import.meta.dirname;

app.get("/", (c) => {
  const buf = readFileSync(join(ROOT, "asset.txt"), "utf8");
  return c.text(buf);
});

app.get("/bin", (c) => {
  const buf = readFileSync(join(ROOT, "asset.txt"));
  c.header("content-type", "application/octet-stream");
  return c.text(String(buf));
});

app.serve({ port: 3852 });
