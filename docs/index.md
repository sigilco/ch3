# Introduction

ch3 is a minimal async-first HTTP router for `node:http`, authored inside the [scriptc](https://github.com/sigilco/scriptc) compilable subset so the same source compiles to a native ELF.

```ts
import { createRouter } from "ch3";

const app = createRouter();

app.get("/", (c) => c.text("hi"));
app.get("/user/:id", (c) => c.json({ id: c.req.param("id") }));
app.post("/echo", (c) => c.text(c.req.body()));
app.notFound((c) => c.status(404).text("not found"));

app.serve({ port: 3000 });
```

Handlers and middleware may be `async`; dispatch settles a `Promise` return under the same error path as sync code, and sync handlers keep a zero-microtask fast path.

## Install

::: tabs

== tab "npm"

```sh
npm i ch3
```

== tab "pnpm"

```sh
pnpm add ch3
```

== tab "bun"

```sh
bun add ch3
```

:::

Next: [Routing](routing.md). For request validation see [Validation](validation.md). For the bundler and native-compile pipeline see [Route lowering plugin](unplugin.md).
