# sse-clock

A Server-Sent Events clock built with `@chttp/stream`. `GET /clock` emits a `tick` event every second and clears its interval when the client disconnects. `GET /` serves a page that listens with `EventSource`.

```sh
pnpm install && pnpm build && PORT=3000 ./app
curl -N http://localhost:3000/clock
```
