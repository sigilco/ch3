// ch3 + @ch3/val validation subject — the subset-native Standard Schema
// library, same route + payload as ch3-valibot for a like-for-like cell.
import { createRouter } from "../../packages/ch3/src/index.ts";
import * as v from "../../packages/val/src/index.ts";

const Item = v.strictObject({
  sku: v.pipe(v.string(), v.minLength(1)),
  qty: v.pipe(v.number(), v.integer(), v.minValue(1)),
  price: v.pipe(v.number(), v.finite()),
});

const Order = v.strictObject({
  id: v.pipe(v.string(), v.uuid()),
  email: v.pipe(v.string(), v.email()),
  items: v.pipe(v.array(Item), v.minLength(1)),
  note: v.optional(v.pipe(v.string(), v.maxLength(200))),
  express: v.boolean(),
  coupon: v.nullable(v.string()),
});

const app = createRouter();

app.get("/json", (c) => c.json({ hello: "world" }));

app.post(
  "/order",
  (c) => {
    const parsed = v.safeParse(Order, JSON.parse(c.req.body()));
    if (!parsed.success) {
      return c.status(400).json({ issues: parsed.issues === null ? 0 : parsed.issues.length });
    }
    const items: unknown[] = (parsed.output as { items: unknown[] }).items;
    return c.json({ ok: true, items: items.length });
  },
  { body: true },
);

app.serve({ port: Number(process.argv[2] || 3000) });
