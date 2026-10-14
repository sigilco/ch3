# webhook-server

A small config driven webhook receiver in the spirit of adnanh/webhook. `POST /hooks/:id` verifies an HMAC signature, checks trigger rules against the JSON payload, then runs the hook's command as an argv vector.

Hooks live in a JSON file (see `hooks.example.json`), validated at boot with `@chttp/val`. A bad config prints the issues and exits 1.

| Step | Behaviour |
| --- | --- |
| Lookup | unknown id returns 404 |
| Signature | `x-hub-signature-256: sha256=<hex>` is an HMAC SHA256 over the raw body with the hook's `secret`, compared with `timingSafeEqual`; mismatch returns 401 |
| Rules | every `{field, equals}` must match a top level scalar payload field; otherwise 202 `{"triggered":false}` |
| Exec | `execFileSync(command, args, { env })`: no shell, no interpolation, and the child only sees `HOOK_ID` plus the payload fields mapped by `env` |
| Result | 200 with the command's stdout, or 500 if it exits non zero or cannot start |

ELF and node run the same source. The spike behind this recipe confirmed under scriptc 0.3.1: `execFileSync` with argv and env, `createHmac` plus `timingSafeEqual`, and `JSON.parse` into a record all compile and behave identically to node.

Limits:

- `spawnSync`'s `env` option has no lowering yet (SC2020), so the recipe uses `execFileSync`, which also means stderr and the exit code are not reported.
- Rules and env mappings read top level scalar fields only, no nested paths.
- No timeout or concurrency limit on commands; a slow hook blocks the server.

```sh
pnpm --filter @chttp/val build && pnpm --filter @chttp/router build   # once
pnpm --filter chttp-example-webhook-server test
cd examples/integrations/webhook-server
scriptc coverage src/main.ts      # 100% static
pnpm build && ./app hooks.example.json
pnpm start:node hooks.example.json
```
