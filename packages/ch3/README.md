# ch3

Minimal async-first HTTP router for `node:http`, zero dependencies, authored inside the [scriptc](https://github.com/sigilco/scriptc) compilable subset. The same source lowers to a native ELF directly, no plugin required.

```ts
import { createRouter } from "ch3";

const app = createRouter();

app.get("/", (c) => c.text("hi"));
app.get("/user/:id", (c) => c.json({ id: c.req.param("id") }));
app.post("/echo", (c) => c.text(c.req.body()), { body: true });
app.notFound((c) => c.status(404).text("not found"));

app.serve({ port: 3000 });
```

## Install

```sh
npm i ch3
```

## Compile to native

The package has zero runtime dependencies and compiles fully statically under scriptc v0.3.0 automatic package compilation, no plugin required:

```sh
scriptc build src/main.ts -o app
./app
```

That is the whole native story: ch3 lowers directly like any subset library. On top of it, [`@ch3/unplugin`](https://github.com/sigilco/ch3/tree/main/packages/unplugin) is an elective build-time dispatch specialization: it recovers the route table from imperative registrations and emits a `CompiledRoutes` dispatch that skips the runtime trie (works with plain vite/rollup; composes with [`unplugin-scriptc`](https://github.com/sigilco/unplugin-scriptc) for the ELF pipeline, where ch3 must be program code). See the [unplugin docs](https://github.com/sigilco/ch3/blob/main/docs/unplugin.md).

## Docs

- Full documentation: <https://ch3js.pages.dev/>
- Benchmarks: `bench/RESULTS-v2.md` in the repo
- Examples: `examples/` in the repo

## License

Apache-2.0
