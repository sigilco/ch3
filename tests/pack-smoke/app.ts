// Pack smoke fixture: consumes @chttp/router and @chttp/val from their packed
// npm tarballs and must compile to a native ELF with scriptc.
// Keep `issues` narrowed inline; an unguarded `r.issues.length` is a type
// error that scriptc reports as SC2013 against an npm package.
import { createRouter } from "@chttp/router";
import * as v from "@chttp/val";

const Body = v.strictObject({
  name: v.pipe(v.string(), v.minLength(1)),
  tags: v.pipe(v.array(v.string()), v.minLength(1)),
});

const app = createRouter();

app.get("/json", (c) => c.json({ hello: "world" }));

app.post(
  "/val",
  (c) => {
    const r = v.safeParse(Body, JSON.parse(c.req.body()));
    if (!r.success) {
      return c.status(422).json({ issues: r.issues === null ? 0 : r.issues.length });
    }
    return c.json({ ok: true });
  },
  { body: true },
);

app.serve({ port: Number(process.argv[2] || 3000) });
