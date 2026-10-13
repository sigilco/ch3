# ch3 examples

Standalone templates for common Hono/H3-style use cases. Each is a normal `npm i ch3` project whose `build` script compiles to a native ELF via `scriptc build`. No bundler required for the basic templates; `vite-elf` shows the bundler pipeline with `@sigilco/unplugin-scriptc`.

| Template | Shows |
| --- | --- |
| `hello` | Static, param, and wildcard GET routes |
| `middleware` | `app.use` global and per-route middleware |
| `json-api` | POST body (`{ body: true }`), `onError`, `notFound` |
| `router-mount` | `app.route` sub-router mounting |
| `vite-elf` | Vite + `@sigilco/unplugin-scriptc` bundler pipeline |

```sh
cd examples/hello
npm install          # installs ch3 + scriptc (once ch3 0.1.0 is published)
npm run build        # scriptc build src/main.ts -o app
./app                # ELF listening on :3000
```

For build-time route lowering (compiled dispatch) add `@ch3/unplugin` and a `.ch3.ts` routes module; under scriptc that path needs ch3 as program code (vendored `ch3/src` or workspace source). See `docs/unplugin.md` → "Compiling with scriptc" for the two tiers.
