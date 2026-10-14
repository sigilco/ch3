import { createRouter } from "@chttp/router";

const app = createRouter();

app.get("/", (c) => c.text("vite + scriptc ELF"));
app.get("/user/:id", (c) => c.json({ id: c.req.param("id") }));

app.serve({ port: 3000 });
