# ch3

A minimal async-first HTTP router for `node:http` with zero dependencies.

The whole package is authored inside the **scriptc compilable subset**: it
lowers statically into a native ELF via `scriptc build --npm-static ch3`
with zero deferred sites (100% static coverage, scriptc 0.2.8).

## 🚀 Quick start

Install:

```bash
npm i ch3
```

Import:

```ts
import { createRouter } from "ch3";

const app = createRouter();

app.get("/", (c) => c.text("hi"));
app.get("/user/:id", (c) => c.json({ id: c.req.param("id") }));
app.post("/echo", (c) => c.text(c.req.body()));
app.notFound((c) => c.status(404).text("not found"));

app.serve({ port: 3000 });
```

## ✔️ Routing

Static segments, `:param`, and a tail `*` wildcard:

```ts
app.get("/user/:id", (c) => c.req.param("id")); // 'id' is literal-typed
app.get("/wild/*", (c) => c.req.param("*"));
app.all("/any-method", handler);
app.on("m-search", "/custom", handler);
```

`GET` handlers also answer `HEAD`. A matched path with an unknown method
gets a `405` with an `Allow` header built from the route's method table.

## ✔️ Context

Handlers and middleware may be `async` — dispatch settles a `Promise`
return with the same error path as synchronous code. Request access stays
synchronous: dispatch pre-buffers the body for POST/PUT/PATCH/DELETE, so
handlers never await on `c.req`.

```ts
c.req.param("id");    // string | null, percent-decoded
c.req.query("q");     // string | null
c.req.queries("tag"); // string[], all values for a repeated key
c.req.queryAll();     // Record<string, string>
c.req.header("x-foo");
c.req.body();         // string
c.req.method; c.req.path; c.req.raw;
```

## ✔️ Responses

All response helpers write at statement level and return `c` for chaining:

```ts
c.json({ ok: true });
c.text("plain");
c.html("<h1>hi</h1>");
c.status(201).json({ created: true });
c.header("x-trace", "abc");
c.redirect("/elsewhere", 302);
```

## ✔️ Middleware

`(c, next) => void | Promise<void>` — sync or async. Applies to routes
registered after it (snapshot semantics):

```ts
app.use((c, next) => {
  c.header("x-start", Date.now().toString());
  next();
});

app.use(async (c, next) => {
  await auth(c.req);
  await next();
});
```

Mount sub-routers with `app.route(prefix, subApp)`; parent and sub
middleware merge.

## ✔️ Error handling

```ts
app.onError((err, c) => {
  c.status(500).json({ message: err.message });
});
```

An error thrown anywhere in the chain — sync throw or rejected promise —
lands here. The built-in 500 path is the fallback when unset, when the
handler never responds, or when the handler itself throws or rejects. The `405` error carries `.allow` for custom bodies.

## ✔️ Compile to a native binary

Because ch3 stays inside the scriptc subset, the same code compiles to a
native ELF:

```sh
scriptc build app.js --npm-static ch3 --optimization=speed -o app-bin
./app-bin 3000
```

Numbers (shared VM, compare ratios not absolutes; full matrix in
[bench/RESULTS-v2.md](bench/RESULTS-v2.md)):

| subject | json | pipelined (-c100 -p10) | cold start | RSS after 100k req |
|---|---|---|---|---|
| ch3 on node | 0.87× raw-node | 0.95× | 83 ms | 116 MB |
| **ch3 compiled (ELF)** | **1.15× raw-node** | **1.76× (204k rps)** | **3 ms** | **4 MB** |
| fastify on node | 0.69× | 0.65× | 111 ms | 108 MB |

The compiled build sits at ≥96% of a bare compiled `node:http` server on
every cell: the router costs ~0.1-0.3 MB of binary and ~1 MB RSS.

## 📖 Docs

- [Architecture](ARCHITECTURE.md): why it compiles, the subset rules
- [Route contract](docs/route-contract.md): the generated-dispatch seam
- Full docs site: https://ch3js.pages.dev/

## ⚙️ Build & test

```sh
npm run build     # tsc → dist/esm and dist/cjs
npm test          # node --test test/
```

## License

Published under the [MIT](LICENSE) license.
