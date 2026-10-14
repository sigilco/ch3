// SSR page served via @chttp/router (scriptc program-code probe)

import { createRouter } from "../../packages/router/src/index.ts";
import { page } from "./html-tag.ts";

const app = createRouter();

app.get("/", (c) => {
  let name = c.req.query("name");
  if (name === null) {
    name = "world";
  }
  const doc = page("probe", `<h1>Hello ${name}</h1><p>scriptc SSR probe</p>`);
  return c.html(doc);
});

app.get("/api/count", (c) => {
  return c.json({ ok: true, n: 1 });
});

app.serve({ port: 3847 });
