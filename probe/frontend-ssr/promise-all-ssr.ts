import { createRouter } from "../../packages/router/src/index.ts";

function slot(): Promise<string> {
  return Promise.resolve("<p>a</p>");
}

const app = createRouter();

app.get("/", async (c) => {
  const parts = await Promise.all([slot(), slot()]);
  return c.html("<div>" + parts[0] + parts[1] + "</div>");
});

app.serve({ port: 3850 });
