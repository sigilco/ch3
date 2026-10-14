# Deploy

A chttp app compiles to one static ELF, so deploying is a file copy. The reference template is [`examples/deploy-docker`](https://github.com/sigilco/chttp/tree/main/examples/deploy-docker): a multi-stage Dockerfile that ships a `FROM scratch` image of **1.24 MB**.

```sh
cd examples/deploy-docker
docker build -t chttp-deploy .
docker run --rm -p 8080:8080 chttp-deploy
```

## Why scratch works

The binary is fully static, so the runtime image needs no libc, node or shell:

```sh
$ ldd server
/lib/ld-musl-aarch64.so.1: server: Not a valid dynamic program
```

Build inside the container, not on your host. scriptc 0.3.1 has no `--target` flag, so building on an alpine (musl) stage is what guarantees a static linux binary. Copy the result into `scratch`.

Runtime details in the template:

- `USER 65532:65532` runs non-root. The uid is numeric because scratch has no `/etc/passwd`.
- `ENTRYPOINT ["/server"]` with `CMD ["8080"]` lets you override the port: `docker run chttp-deploy 9090`.
- There is no shell, so healthchecks and debug commands must run the binary itself (see below) or use a different base.

## Size and footprint

| Image                                    | Size                   |
| ---------------------------------------- | ---------------------- |
| scratch runtime                          | **1.24 MB**            |
| alpine:3 runtime (adds shell, `wget`)    | 14.7 MB                |
| `node:22-alpine` running the app on node | ~234 MB                |
| `node:22-alpine` build stage             | 234 MB (never shipped) |

|                    | chttp on node | chttp ELF in scratch |
| ------------------ | ------------- | -------------------- |
| cold start         | 83 ms         | ~3 ms                |
| RSS after 100k req | 116 MB        | 4 MB                 |

Idle RSS of the two-route template is 636 KiB in `docker stats`. Full matrix: [bench/RESULTS-v2.md](https://github.com/sigilco/chttp/blob/main/bench/RESULTS-v2.md).

## Healthchecks

`scratch` has no curl or wget. Pick one:

**Binary self-check (template default).** The app exits 0 on `--health` before binding a port:

```ts
if (process.argv.length > 2 && process.argv[2] === "--health") {
  process.exit(0);
}
```

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=2s --retries=3 \
  CMD ["/server", "--health"]
```

This proves the binary starts, not that the socket accepts. It stays green while a live process is wedged.

**Network probe (alpine runtime).** Exercises the real HTTP path:

```dockerfile
HEALTHCHECK CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
```

Need curl? Use a distroless or wolfi base.
