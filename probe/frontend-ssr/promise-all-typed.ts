import { createRouter } from "../../packages/router/src/index.ts";

function slot(): Promise<string> {
  return Promise.resolve("<p>a</p>");
}

const app = createRouter();

app.get("/", async (c) => {
  const jobs: Promise<string>[] = [slot(), slot()];
  const parts = await Promise.all(jobs);
  let html = "<div>";
  let i = 0;
  while (i < parts.length) {
    html = html + parts[i];
    i = i + 1;
  }
  html = html + "</div>";
  return c.html(html);
});

app.serve({ port: 3851 });
