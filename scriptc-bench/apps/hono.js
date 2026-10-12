import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

app.get("/json", (c) => c.json({ ok: true, value: 1 }));
app.get("/user/:id", (c) => c.json({ id: c.req.param("id") }));
app.post("/echo", async (c) => {
  const body = await c.req.arrayBuffer();
  return c.body(body, 200, {
    "content-type": c.req.header("content-type") || "application/octet-stream",
  });
});

const port = Number(process.env.PORT || 3000);
serve({ fetch: app.fetch, port }, () => console.log(`hono listening on ${port}`));
