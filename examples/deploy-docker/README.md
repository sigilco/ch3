# Deploy: Docker (scratch image)

A standalone template for shipping a chttp app as one static ELF inside a
`FROM scratch` container: no node, no libc, no shell. The image is the binary.

```sh
cd examples/deploy-docker
docker build -t chttp-deploy .
docker run --rm -d -p 8080:8080 --name chttp-deploy chttp-deploy
curl http://localhost:8080/           # {"ok":true,"uptime":123}
curl http://localhost:8080/hello      # hello from chttp
docker stop chttp-deploy
```

## What's inside

| File | Role |
| --- | --- |
| `src/main.ts` | Two-route app (`GET /` health JSON, `GET /hello`) in the scriptc subset, plus a `--health` mode |
| `Dockerfile` | Multi-stage: `node:22-alpine` builder, `FROM scratch` runtime |
| `tsconfig.json` | Type-checking only (`noEmit`); scriptc does the real compile |

## How the image gets to ~4 MB

The builder stage installs `zig` (scriptc shells out to it as its linker),
installs dependencies with pnpm via corepack, and runs
`scriptc build src/main.ts -o server --strip`. On alpine, scriptc produces a
**fully static musl binary**:

```sh
$ ldd server
/lib/ld-musl-aarch64.so.1: server: Not a valid dynamic program   # static
```

A static binary needs no base layer, so stage 2 is `FROM scratch`, `COPY
--from=builder /app/server /server`, `USER 65532:65532` (numeric uid: scratch
has no `/etc/passwd`), `EXPOSE 8080`, and the binary as `ENTRYPOINT`.

Measured on linux/arm64 (Docker Desktop via Dory), scriptc 0.3.1, `--strip`:

| Image | Size |
| --- | --- |
| `node:22-alpine` builder | 234 MB (never shipped) |
| `chttp-deploy` (scratch) | **1.24 MB** |
| alpine:3 runtime variant | 14.7 MB (binary + alpine base + wget) |
| `node:22-alpine` running the app on node | ~234 MB |

The runtime inherits the properties of the compiled binary measured in
[bench/RESULTS-v2.md](../../bench/RESULTS-v2.md): ~3 ms cold start and ~4 MB
RSS under load (README). A scratch container adds no processes on top: idle
RSS for this two-route app measured 636 KiB via `docker stats`.

## Healthcheck

`FROM scratch` has no shell, no curl, no wget. Instead of shipping one, the
binary checks itself:

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=2s --retries=3 \
  CMD ["/server", "--health"]
```

`src/main.ts` exits 0 on `--health` before binding any port, so the check
also works while the main process serves traffic. If you switch to an alpine
runtime, prefer a real network probe instead:

```dockerfile
HEALTHCHECK CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
```

## Why build inside the container

scriptc 0.3.1 has no cross-compile flag (`scriptc build --help` has no
`--target`); the target follows the host. Building on the alpine builder
produces the linux/musl binary natively, sidestepping cross-compilation
entirely, and musl links static by default. If a future scriptc release adds
`--target`, you could compile on macOS and `COPY` a prebuilt binary, keeping
the builder out of CI. Until then, build-in-container is the simple path.

## Custom port

`CMD ["8080"]` is the port argument; the app defaults to 8080 (unprivileged)
either way:

```sh
docker run --rm -p 9090:9090 chttp-deploy 9090
```

## Dev loop

```sh
npm install
npm run build   # scriptc build src/main.ts -o server --strip
./server        # ELF listening on :8080
```
