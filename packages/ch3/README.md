# ch3

Minimal async-first HTTP router for `node:http` with zero dependencies, authored inside the [scriptc](https://scriptc.dev) compilable subset.

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

The package compiles fully statically under scriptc v0.3.0 automatic package compilation:

```sh
scriptc build src/main.ts -o app
./app
```

Add [`@ch3/unplugin`](https://github.com/sigilco/ch3/tree/main/packages/unplugin) for build-time route lowering (compiled dispatch), and [`unplugin-scriptc`](https://github.com/sigilco/unplugin-scriptc) to run the scriptc compile from your bundler. Compiled dispatch requires ch3 as program code; see the unplugin docs for the source-layout options.

## Docs

- Full documentation: <https://ch3js.pages.dev/>
- Benchmarks: `bench/RESULTS-v2.md` in the repo
- Examples: `examples/` in the repo

## License

Apache-2.0
