# chttp deploy template: node builder -> FROM scratch runtime (~4 MB image).
#
# Build from this directory (the example is standalone, no workspace needed):
#   docker build -t chttp-deploy .
#   docker run --rm -p 8080:8080 chttp-deploy
#   curl http://localhost:8080/          # {"ok":true,"uptime":0}
#
# Why these bases:
# - node:22-alpine as builder: scriptc 0.3.1 has no cross-compile flag
#   (scriptc build --help has no --target), so the linux/musl binary is
#   produced natively inside the container. Alpine because (a) it carries
#   zig in its community repo, and scriptc shells out to `zig` to link the
#   ELF (a glibc builder needs a manual zig install), and (b) musl links
#   static by default, so the binary needs zero shared libraries at runtime.
#   The builder is ~180 MB but is never shipped; only the ELF is copied out.
# - FROM scratch as runtime: the binary is fully static (verify with
#   `ldd server` -> "Not a valid dynamic program"), so it needs no libc, no
#   shell, no base layer at all. Attack surface: one file. Image size equals
#   binary size (~3-4 MB). Non-root via USER 65532 (no /etc/passwd in
#   scratch, so a numeric uid is the only option).
#
# Alternative runtimes, see README.md:
# - alpine:3 as runtime when you need a shell / wget / debugging. +8 MB.
#   HEALTHCHECK then uses `wget --spider` instead of the binary itself.

FROM node:22-alpine AS builder

# scriptc's linker (not present in node:22-alpine; alpine community has it)
# and the compiler itself (global install keeps it out of the deps layer).
RUN apk add --no-cache zig \
 && npm install -g scriptc@0.3.1

# corepack ships with node 22; activate the pinned pnpm without network auth.
RUN corepack enable && corepack prepare pnpm@latest-10 --activate

WORKDIR /app

# Install first so deps layer-cache separately from source.
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --prod || pnpm install --prod

COPY tsconfig.json ./
COPY src ./src

# Compiles src/main.ts + @chttp/router (auto-detected as a statically
# compilable npm package) into one static musl ELF. --strip drops symbols.
RUN scriptc build src/main.ts -o server --strip

FROM scratch AS runtime

# Static ELF only. No shell, no libc, no package manager.
COPY --from=builder /app/server /server

# Non-root. Numeric uid: scratch has no /etc/passwd to resolve a name.
USER 65532:65532

# Unprivileged port.
EXPOSE 8080

# scratch cannot run curl/wget, so the binary checks itself: `--health`
# exits 0 immediately without binding the port. In an alpine runtime,
# swap for: HEALTHCHECK CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
HEALTHCHECK --interval=30s --timeout=3s --start-period=2s --retries=3 \
  CMD ["/server", "--health"]

ENTRYPOINT ["/server"]
# Optional port override: docker run -p 9090:9090 chttp-deploy 9090
CMD ["8080"]
