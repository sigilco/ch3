// ch3 + valibot validation subject — canonical-style app plus a POST
// route that JSON.parses the body and safeParses it against a Standard
// Schema (valibot). Mirrors real REST usage: parse -> validate -> 200/400.
import { createRouter } from "../../packages/ch3/src/index.ts";
import * as v from "valibot";

const Item = v.strictObject({
  sku: v.pipe(v.string(), v.minLength(1)),
  qty: v.pipe(
    v.number(),
    v.integer(),
    v.check((n) => n >= 1, "gte1"),
  ),
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
      return c.status(400).json({ issues: parsed.issues.length });
    }
    return c.json({ ok: true, items: parsed.output.items.length });
  },
  { body: true },
);

app.serve({ port: Number(process.argv[2] || 3000) });
