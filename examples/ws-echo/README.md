# ws-echo

Minimal `@chttp/ws` server: `/echo` echoes text and binary, `/room/:name` prefixes messages with the room name.

```sh
pnpm install
pnpm build          # vendors router + ws sources, then scriptc build src/main.ts -o app
./app               # listens on :3000
pnpm start:node     # same source under node (strip types)
```

The build vendors the sources because scriptc only lowers subclasses of package classes when the whole graph is program code, and attaches the `"upgrade"` listener inline for the same reason. See `docs/websocket.md`.
