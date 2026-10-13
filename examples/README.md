# ch3 examples

Standalone templates for common Hono/H3-style use cases. Each is a normal `npm i ch3` project: the basic templates compile straight to a native ELF via `scriptc build` (ch3 lowers directly like any scriptc-subset library, no bundler or plugin required); `vite-elf` shows the bundler pipeline with `unplugin-scriptc`, and `vite-lowering` the elect build-time route lowering with a plain JS dist.

| Template | Shows |
| --- | --- |
| `hello` | Static, param, and wildcard GET routes |
| `middleware` | `app.use` global and per-route middleware |
| `json-api` | POST body (`{ body: true }`), `onError`, `notFound` |
| `router-mount` | `app.route` sub-router mounting |
| `vite-elf` | Vite + `unplugin-scriptc` bundler pipeline |
| `vite-lowering` | Vite + `@ch3/unplugin` build-time route lowering, JS dist |

```sh
cd examples/hello
npm install          # installs ch3 + scriptc (once ch3 0.1.0 is published)
npm run build        # scriptc build src/main.ts -o app
./app                # ELF listening on :3000
```

For build-time route lowering (compiled dispatch) with a plain JS dist, see `examples/vite-lowering`: `@ch3/unplugin` + a `.ch3.ts` routes module, no scriptc involved. It is elective dispatch specialization on top of a core that already compiles natively; under scriptc that path needs ch3 as program code (vendored `ch3/src` or workspace source). See `docs/unplugin.md` → "Two output modes" for the two tiers.
