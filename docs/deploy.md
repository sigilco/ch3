# Deploy

chttp apps compile to one static ELF, which makes deployment a file copy. The
reference template is [`examples/deploy-docker`](https://github.com/sigilco/chttp/tree/main/examples/deploy-docker), a multi-stage Dockerfile producing a `FROM scratch` image at **1.24 MB**.

## How to run chttp in Docker

The binary is fully static:

```sh
$ ldd server
/lib/ld-musl-aarch64.so.1: server: Not a valid dynamic program
```

Details worth knowing:

- `USER 65532:65532` runs non-root. Numeric uid because scratch has no
  `/etc/passwd` to resolve a name against.
- `EXPOSE 8080` documents the unprivileged default port; the app reads a
  positional arg as a port override (`docker run image 9090`).
- `ENTRYPOINT ["/server"]` + `CMD ["8080"]` keeps the port overridable without
  repeating the binary path.
- No shell exists. Anything shell-shaped (healthchecks, debug commands) must
  run the binary itself or use a different base.

## Image size, measured

| Image                                    | Size                   |
| ---------------------------------------- | ---------------------- |
| `node:22-alpine` builder                 | 234 MB (never shipped) |
| scratch runtime                          | **1.24 MB**            |
| alpine:3 runtime variant                 | 14.7 MB                |
| `node:22-alpine` running the app on node | ~234 MB                |

The scratch image is the binary plus container metadata; there is no libc, no
node, no shell. The alpine variant buys `wget`, a shell, and a package manager
for 13.5 MB more. Running the same app on node inside the node:22-alpine image
costs ~190x the scratch image.

## Cold start and memory

The compiled binary's measured properties carry over to the container
unchanged (full matrix in [bench/RESULTS-v2.md](https://github.com/sigilco/chttp/blob/main/bench/RESULTS-v2.md), summary in the
[README](https://github.com/sigilco/chttp#readme)):

|                    | chttp on node | chttp ELF in scratch |
| ------------------ | ------------- | -------------------- |
| cold start         | 83 ms         | ~3 ms                |
| RSS after 100k req | 116 MB        | 4 MB                 |

A scratch container adds no processes on top of the ELF. Idle RSS for the
two-route template measured 636 KiB via `docker stats`.

## Healthcheck patterns

`FROM scratch` cannot run curl or wget. Two working patterns:

**Binary self-check (template default).** The app handles a `--health` argv
flag by exiting 0 before binding any port:

```ts
if (process.argv.length > 2 && process.argv[2] === "--health") {
  process.exit(0);
}
```

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=2s --retries=3 \
  CMD ["/server", "--health"]
```

Caveat: this proves the binary executes, not that the socket accepts. It
cannot fail while the process is wedged but alive.

**Network probe (alpine runtime).** With alpine's wget, the check exercises
the actual HTTP path:

```dockerfile
HEALTHCHECK CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
```

Or hit the health route directly (`GET /` returns `{"ok":true,"uptime":...}`).
If you need curl specifically, use a distroless or wolfi base instead.

## Cross-compiling instead

Not available in scriptc 0.3.1: `scriptc build --help` has no `--target` flag,
and the target follows the host toolchain. Build-in-container is therefore the
supported path, and it also guarantees the musl runtime pack matches the
output ABI. When a `--target` flag lands, a macOS CI step could emit the
linux binary directly and the Dockerfile would shrink to `FROM scratch` +
`COPY` (keep an alpine builder stage around for caching either way).
