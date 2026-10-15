# ws-echo

Minimal `@chttp/ws` server: `/echo` echoes text and binary, `/room/:name` prefixes messages with the room name.

```sh
pnpm install
pnpm build          # vendors router + ws sources, then scriptc build src/main.ts -o app
./app               # listens on :3000
pnpm start:node     # same source under node (strip types)
```

The build vendors the sources because scriptc only lowers subclasses of package classes when the whole graph is program code, and attaches the `"upgrade"` listener inline for the same reason. See `docs/websocket.md`.

## Native FFI

`/ffi/{text}` returns the FNV-1a hash of `{text}`, computed in `ffi_native.c` and called through `scriptc --ffi` outbound FFI. Native code pulls each byte through a call-scoped TypeScript callback (`ffi.json` describes the signature). The route only exists in the ELF build — under `pnpm start:node` the `declare function` is erased and calling it throws. See `docs/native.md`.
