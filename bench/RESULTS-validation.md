# Validation bench results

> 2026-10-14: subjects renamed ch3* → chttp* (brand rename); measurements unchanged.

## 2026-10-13 — valibot vs @chttp/val, node + ELF

Subjects (POST /order, `autocannon -c64 -d6 ×3`, median Req/Sec, shared VM loopback):

- `chttp-postplain` — reads body, responds (no parse)
- `chttp-parseonly` — `JSON.parse` only
- `chttp-valibot` — JSON.parse + `v.safeParse` (valibot strictObject order schema)
- `chttp-val` — JSON.parse + `v.safeParse` (@chttp/val, same schema)
- `chttp-valibot-elf` — valibot subject compiled; **broken** (class poisoning, all 500s)

| Subject           | Mode | Run 1  | Run 2   | Run 3   | Median                |
| ----------------- | ---- | ------ | ------- | ------- | --------------------- |
| chttp-postplain     | node | ~72k   | —       | —       | ~72k (earlier cell)   |
| chttp-parseonly     | node | ~65k   | —       | —       | ~65k (earlier cell)   |
| chttp-valibot       | node | ~58.5k | —       | —       | ~58.5k (earlier cell) |
| chttp-val           | node | 55,391 | 57,855  | 58,655  | **57,855**            |
| chttp-postplain-elf | ELF  | 98,175 | 95,807  | 97,855  | **97,855**            |
| chttp-parseonly-elf | ELF  | 99,839 | 103,167 | 104,575 | **103,167**           |
| chttp-val           | ELF  | 73,407 | 72,383  | 73,279  | **73,279**            |

Findings:

- Node: @chttp/val ≈ [valibot](https://github.com/open-circle/valibot) overhead (~−10% vs parse-only, ~−20% vs body-only). Validation is not a heavy tax in Node mode.
- ELF: @chttp/val safeParse costs ~−26% vs unvalidated ELF POST (73k vs 98k), ~−29% vs parse-only ELF (103k).
- ELF + @chttp/val (73k) is still ~25% faster in absolute throughput than Node + valibot (58.5k), with identical validation coverage.
- valibot cannot run inside a chttp ELF: importing it downgrades program classes to dynamic objects (`c.json is not a function`, 500s → crash). See `docs/validation.md`.

Schema (both validators): strictObject { id: string+uuid, email: string+email, items: array(strictObject{sku: string+minLength(1), qty: number+integer+minValue(1), price: number+finite})+minLength(1), note: optional(string+maxLength(200)), express: boolean, coupon: nullable(string) }.
