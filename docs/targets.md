# Run targets

The same source runs on node or compiles to a native ELF. Pick per deployment.

## Node

```sh
node app.js
```

Any npm package works. `app.serve()` wraps `http.createServer`; use `app.handler()` to mount into your own server.

## Native ELF

```sh
scriptc build app.js --npm-static @chttp/router --optimization=speed -o app-bin
./app-bin 3000
```

Everything the app imports must stay inside the scriptc subset, so npm packages outside it do not compile. Check with `scriptc coverage`. Rules for authors: [Coding agents](architecture.md).

## Bundler pipeline

`unplugin-scriptc` runs `scriptc build` inside Vite. `@chttp/unplugin` additionally lowers the route table at build time: [Route lowering plugin](unplugin.md).

## Docker

A `FROM scratch` image of about 1.2 MB: [Deploy](deploy.md).

## Benchmarks

Ratios against raw `node:http`, cold start and RSS: [Benchmarks](benchmarks.md).
