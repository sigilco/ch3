# Quickstart

```sh
pnpm add @chttp/router
```

```ts
import { createRouter } from "@chttp/router";

const app = createRouter();

app.get("/", (c) => c.text("hi"));
app.get("/user/:id", (c) => c.json({ id: c.req.param("id") }));
app.post("/echo", (c) => c.text(c.req.body()));
app.notFound((c) => c.status(404).text("not found"));

app.serve({ port: 3000 });
```

```sh
node app.js
curl localhost:3000/user/42
```

## Where to go next

- Run it as a native binary or in Docker: [Run targets](targets.md), [Deploy](deploy.md).
- Add routes, params and sub-routers: [Routing](routing.md).
- Read request data and write responses: [Context](context.md).
- Cross-cutting behavior: [Middleware](middleware.md).
- Copyable projects: [Examples](examples.md).
