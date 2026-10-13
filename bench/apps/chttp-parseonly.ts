// chttp + JSON.parse-only subject — identical to chttp-valibot but stops at
// JSON.parse; isolates the schema-validation share of the validation cost.
import { createRouter } from "../../packages/chttp/src/index.ts";

const app = createRouter();

app.get("/json", (c) => c.json({ hello: "world" }));

app.post(
  "/order",
  (c) => {
    const parsed = JSON.parse(c.req.body());
    return c.json({ ok: true, items: parsed.items.length });
  },
  { body: true },
);

app.serve({ port: Number(process.argv[2] || 3000) });
