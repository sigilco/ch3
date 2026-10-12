# Introduction

ch3 is a minimal synchronous HTTP router for `node:http` with zero dependencies, authored inside the scriptc compilable subset.

```ts
import { createRouter } from "ch3";

const app = createRouter();

app.get("/", (c) => c.text("hi"));
app.get("/user/:id", (c) => c.json({ id: c.req.param("id") }));
app.post("/echo", (c) => c.text(c.req.body()));
app.notFound((c) => c.status(404).text("not found"));

app.serve({ port: 3000 });
```

## Why

Two reasons:

- Handlers are synchronous. Dispatch pre-buffers request bodies, so there is no await anywhere in the hot path.
- The package obeys the scriptc compilable subset (see [Architecture](architecture.md)), so the exact same source compiles to a native ELF: 3 ms cold start, 4 MB RSS, 204k req/s pipelined on a shared VM.

## Install

```bash
npm i ch3
```

Next: [Routing](routing.md).
