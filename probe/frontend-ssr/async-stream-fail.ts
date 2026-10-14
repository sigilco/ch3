// Streaming SSR sketch: join async child HTML (likely subset-hostile)

import { createRouter } from "../../packages/router/src/index.ts";

async function childHtml(): Promise<string> {
  return "<section>async</section>";
}

const app = createRouter();

app.get("/", async (c) => {
  const a = await childHtml();
  const b = await childHtml();
  return c.html("<div>" + a + b + "</div>");
});

app.serve({ port: 3848 });
