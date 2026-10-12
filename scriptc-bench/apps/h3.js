import { createServer } from "node:http";
import { H3, toNodeHandler } from "h3";

const app = new H3();

const json = (obj) => new Response(JSON.stringify(obj), {
  status: 200,
  headers: { "content-type": "application/json" },
});

app.get("/json", () => json({ ok: true, value: 1 }));
app.get("/user/:id", (event) => json({ id: event.context.params.id }));
app.post("/echo", async (event) => {
  const body = await event.req.arrayBuffer();
  return new Response(body, {
    status: 200,
    headers: { "content-type": event.req.headers.get("content-type") || "application/octet-stream" },
  });
});

const port = Number(process.env.PORT || 3000);
createServer(toNodeHandler(app)).listen(port, () => console.log(`h3 listening on ${port}`));
