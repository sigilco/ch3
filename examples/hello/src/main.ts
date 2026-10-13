import { createRouter } from "ch3";

const app = createRouter();

app.get("/", (c) => c.text("hello from ch3"));
app.get("/user/:id", (c) => c.json({ id: c.req.param("id") }));
app.get("/files/*", (c) => c.text("path: " + c.req.param("*")));

app.serve({ port: 3000 });
