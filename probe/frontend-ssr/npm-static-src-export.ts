import { createRouter } from "@chttp/router/src/index.ts";

const app = createRouter();

app.get("/", (c) => {
  return c.text("ok");
});

app.serve({ port: 3998 });
