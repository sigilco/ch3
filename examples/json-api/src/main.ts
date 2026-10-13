import { createRouter } from "chttp";
import type { Ctx } from "chttp";

const app = createRouter();

app.get("/api/items/:id", (c) => c.json({ id: c.req.param("id"), name: "item" }));

// { body: true } declares body buffering so c.req.body() sees the payload.
app.post("/api/items", async (c: Ctx) => {
  const raw = c.req.body();
  if (raw.length === 0) {
    return c.status(400).json({ error: "empty body" });
  }
  return c.status(201).json({ received: raw });
}, { body: true });

app.notFound((c) => c.status(404).json({ error: "not found" }));
app.onError((err: unknown, c: Ctx): void => {
  console.log("onError: " + String(err));
  c.status(500).json({ error: "internal" });
});

app.serve({ port: 3000 });
