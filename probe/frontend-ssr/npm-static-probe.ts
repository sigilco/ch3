import { createRouter } from "@chttp/router";

const app = createRouter();

app.get("/", (c) => {
  return c.text("ok");
});

app.serve({ port: 3999 });
