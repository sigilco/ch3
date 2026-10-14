# Deploy

Pick one of three ways to ship a chttp app.

| Option                  | Ships                       | Image or artifact | Cold start |
| ----------------------- | --------------------------- | ----------------- | ---------- |
| Docker (`FROM scratch`) | one static binary           | 1.24 MB           | ~3 ms      |
| Binary only             | one static binary           | ~1.2 MB           | ~3 ms      |
| Node                    | your JS plus `node_modules` | node runtime      | 83 ms      |

## Docker

Copy [`examples/deploy-docker/Dockerfile`](https://github.com/sigilco/chttp/blob/main/examples/deploy-docker/Dockerfile) next to your app. It builds the binary in an alpine stage and copies it into `scratch`.

```sh
docker build -t my-app .
docker run --rm -p 8080:8080 my-app
```

The image has no shell, so debug with a different base if you need one.

## Binary only

Build, copy the file, run it. No runtime needed on the host.

```sh
scriptc build src/main.ts -o app --strip
./app
```

scriptc 0.3.1 cannot cross-compile (no `--target`), so build on the OS and architecture you deploy to. For a linux server, build in CI on linux or inside an alpine container. An alpine build is fully static (musl), so it runs on any linux of the same architecture.

## Node

No build step. Deploy the JS like any node service:

```sh
node app.js
```

Use this when you need npm packages outside the scriptc subset. See [Run targets](targets.md).
