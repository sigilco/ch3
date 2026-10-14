import { createRouter } from "../../../packages/router/src/index.ts";
import { countPage } from "./lib/page.ts";

const app = createRouter();

app.get("/", (c) => {
  const q = c.req.query("name");
  let name = "world";
  if (q !== null) {
    name = q;
  }
  return c.html(countPage(name).s);
});

app.get("/api/count", (c) => {
  return c.json({ n: 3 });
});

app.get("/slow", async (c) => {
  return c.html(countPage("a<b").s);
});

app.serve({ port: 8765, host: "127.0.0.1" });
