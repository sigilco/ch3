import { createRouter } from "@chttp/router";

const app = createRouter();

// Registered before use(): no middleware applies to this route.
app.get("/", (c) => c.text("public"));

// Global middleware: snapshots onto every route registered after it.
app.use(async (c, next) => {
  const t0 = Date.now();
  await next();
  console.log(c.req.method + " " + c.req.path + " " + (Date.now() - t0) + "ms");
});

app.get("/timed", (c) => c.text("timed"));

// Guarded routes mount their own router with its own middleware.
const priv = createRouter();
priv.use(async (c, next) => {
  if (c.req.header("x-key") !== "open") {
    c.status(403).json({ error: "forbidden" });
    return;
  }
  await next();
});
priv.get("/secret", (c) => c.json({ secret: 42 }));
app.route("/private", priv);

app.serve({ port: 3000 });
