# ch3 bench — baseline matrix (everything except the ch3 row)

Date: 2026-10-11 · Machine: see `ENV.md` (8× Xeon Platinum 8559C, kernel 6.8.0-1061-aws, 31GiB) · autocannon `-c64 -d6` ×3, median · warmup `-c16 -d2` discarded.

**Compare ratios, not absolutes** — `vs raw-node` is the cell's rps ÷ the `raw-node` cell on this same VM. Absolute numbers carry ±50% shared-VM noise (REPORT.md caveat).

The `ch3` row is intentionally pending: `apps/ch3.ts` is wired against the frozen `createRouter` contract importing `../../src/index.ts` and runs the moment `src/` lands. `run.sh` already contains `ch3-node`, `ch3-bun`, and `raw-scriptc`-style ch3 scriptc wiring.

## Headline

- **scriptc beats node on identical source.** The same `apps/raw.ts` (subset-authored) runs 1.00× under `node` and **1.08–1.38×** as a static ELF — fastest scriptc cell 96.8k rps on echo64. Cold start **3ms vs 75ms**, RSS **3MB vs 102MB**, binary **0.3MB**.
- bun runtime is the throughput tier: every bun cell ≥ ~95k rps on GET routes (raw-bun tops at 109k), roughly ceiling-class.
- Ceilings (go chi / rust axum / C mongoose) sit at 103–107k — near autocannon loopback saturation; bun and scriptc are already within ~10–15% of them on GET cells.
- Framework overhead on node is real: fmw 1.0–1.2× (router only), hono 0.85–0.94×, h3 0.5–0.9×, express 0.5–0.6×.

## Matrix

| subject | cell | rps | vs raw-node | p50 ms | p99 ms | MB/s |
|---------|------|-----|-------------|--------|--------|------|
| raw-node | json | 85,909 | 1.00× | 0.00 | 2.0 | 14.1 |
| raw-node | user | 85,013 | 1.00× | 0.00 | 2.0 | 13.5 |
| raw-node | echo64 | 70,307 | 1.00× | 0.00 | 3.0 | 14.3 |
| raw-node | echo1k | 68,181 | 1.00× | 0.00 | 2.0 | 76.4 |
| raw-node | deep | 87,733 | 1.00× | 0.00 | 2.0 | 13.9 |
| raw-node | files | 88,587 | 1.00× | 0.00 | 2.0 | 13.3 |
| raw-node | missing | 87,264 | 1.00× | 0.00 | 2.0 | 13.6 |
| raw-node | mixed | 83,616 | 1.00× | 0.00 | 2.0 | 13.2 |
| raw-scriptc | json | 95,851 | 1.12× | 0.00 | 1.0 | 15.7 |
| raw-scriptc | user | 89,152 | 1.05× | 0.00 | 2.0 | 14.1 |
| raw-scriptc | echo64 | 96,821 | 1.38× | 0.00 | 1.0 | 19.7 |
| raw-scriptc | echo1k | 89,547 | 1.31× | 0.00 | 1.0 | 100.3 |
| raw-scriptc | deep | 94,944 | 1.08× | 0.00 | 1.0 | 15.0 |
| raw-scriptc | files | 96,053 | 1.08× | 0.00 | 1.0 | 14.4 |
| raw-scriptc | missing | 95,573 | 1.10× | 0.00 | 1.0 | 14.9 |
| raw-scriptc | mixed | 90,123 | 1.08× | 0.00 | 2.0 | 14.3 |
| raw-bun | json | 108,811 | 1.27× | 0.00 | 1.0 | 13.0 |
| raw-bun | user | 107,552 | 1.27× | 0.00 | 1.0 | 12.2 |
| raw-bun | echo64 | 104,341 | 1.48× | 0.00 | 1.0 | 18.4 |
| raw-bun | echo1k | 95,723 | 1.40× | 0.00 | 1.0 | 104.6 |
| raw-bun | deep | 107,637 | 1.23× | 0.00 | 1.0 | 12.2 |
| raw-bun | files | 109,376 | 1.23× | 0.00 | 1.0 | 11.5 |
| raw-bun | missing | 104,341 | 1.20× | 0.00 | 1.0 | 11.6 |
| raw-bun | mixed | 102,059 | 1.22× | 0.00 | 2.0 | 11.6 |
| h3-node | json | 73,835 | 0.86× | 0.00 | 3.0 | 13.0 |
| h3-node | user | 73,803 | 0.87× | 0.00 | 2.0 | 12.5 |
| h3-node | echo64 | 44,139 | 0.63× | 1.00 | 4.0 | 9.7 |
| h3-node | echo1k | 41,157 | 0.60× | 1.00 | 4.0 | 46.7 |
| h3-node | deep | 72,237 | 0.82× | 0.00 | 3.0 | 12.3 |
| h3-node | files | 71,627 | 0.81× | 0.00 | 2.0 | 11.6 |
| h3-node | missing | 42,389 | 0.49× | 1.00 | 4.0 | 10.5 |
| h3-node | mixed | 68,155 | 0.82× | 0.00 | 4.0 | 11.6 |
| h3-bun | json | 104,885 | 1.22× | 0.00 | 1.0 | 13.9 |
| h3-bun | user | 101,120 | 1.19× | 0.00 | 2.0 | 12.8 |
| h3-bun | echo64 | 105,248 | 1.50× | 0.00 | 2.0 | 16.7 |
| h3-bun | echo1k | 97,963 | 1.44× | 0.00 | 2.0 | 105.4 |
| h3-bun | deep | 104,725 | 1.19× | 0.00 | 2.0 | 13.3 |
| h3-bun | files | 97,592 | 1.10× | 0.00 | 2.0 | 11.5 |
| h3-bun | missing | 102,837 | 1.18× | 0.00 | 2.0 | 21.8 |
| h3-bun | mixed | 94,859 | 1.13× | 0.00 | 3.0 | 12.0 |
| hono-node | json | 80,597 | 0.94× | 0.00 | 2.0 | 13.2 |
| hono-node | user | 77,579 | 0.91× | 0.00 | 2.0 | 12.3 |
| hono-node | echo64 | 61,549 | 0.88× | 0.00 | 2.0 | 13.4 |
| hono-node | echo1k | 58,155 | 0.85× | 0.00 | 3.0 | 66.0 |
| hono-node | deep | 80,480 | 0.92× | 0.00 | 2.0 | 12.7 |
| hono-node | files | 78,720 | 0.89× | 0.00 | 2.0 | 12.9 |
| hono-node | missing | 76,213 | 0.87× | 0.00 | 2.0 | 13.4 |
| hono-node | mixed | 76,288 | 0.91× | 0.00 | 3.0 | 12.1 |
| hono-bun | json | 105,739 | 1.23× | 0.00 | 1.0 | 12.6 |
| hono-bun | user | 108,587 | 1.28× | 0.00 | 1.0 | 12.3 |
| hono-bun | echo64 | 106,037 | 1.51× | 0.00 | 2.0 | 18.2 |
| hono-bun | echo1k | 102,112 | 1.50× | 0.00 | 2.0 | 111.2 |
| hono-bun | deep | 106,144 | 1.21× | 0.00 | 1.0 | 12.0 |
| hono-bun | files | 106,528 | 1.20× | 0.00 | 2.0 | 12.6 |
| hono-bun | missing | 103,893 | 1.19× | 0.00 | 2.0 | 13.6 |
| hono-bun | mixed | 101,675 | 1.22× | 0.00 | 2.0 | 11.5 |
| fmw-node | json | 90,901 | 1.06× | 0.00 | 1.0 | 16.6 |
| fmw-node | user | 89,205 | 1.05× | 0.00 | 1.0 | 15.6 |
| fmw-node | echo64 | 76,971 | 1.09× | 0.00 | 1.0 | 17.0 |
| fmw-node | echo1k | 74,709 | 1.10× | 0.00 | 1.0 | 85.0 |
| fmw-node | deep | 90,283 | 1.03× | 0.00 | 1.0 | 15.8 |
| fmw-node | files | 89,536 | 1.01× | 0.00 | 1.0 | 15.0 |
| fmw-node | missing | 107,243 | 1.23× | 0.00 | 1.0 | 13.2 |
| fmw-node | mixed | 84,352 | 1.01× | 0.00 | 2.0 | 14.8 |
| fmw-bun | json | 97,739 | 1.14× | 0.00 | 1.0 | 17.8 |
| fmw-bun | user | 97,461 | 1.15× | 0.00 | 1.0 | 17.1 |
| fmw-bun | echo64 | 99,264 | 1.41× | 0.00 | 1.0 | 22.0 |
| fmw-bun | echo1k | 91,467 | 1.34× | 0.00 | 1.0 | 104.1 |
| fmw-bun | deep | 97,589 | 1.11× | 0.00 | 1.0 | 17.1 |
| fmw-bun | files | 98,635 | 1.11× | 0.00 | 1.0 | 16.6 |
| fmw-bun | missing | 113,696 | 1.30× | 0.00 | 1.0 | 14.0 |
| fmw-bun | mixed | 94,795 | 1.13× | 0.00 | 2.0 | 16.6 |
| express-node | json | 52,043 | 0.61× | 1.00 | 2.0 | 11.4 |
| express-node | user | 45,024 | 0.53× | 1.00 | 4.0 | 9.5 |
| express-node | echo64 | 42,027 | 0.60× | 1.00 | 3.0 | 10.8 |
| express-node | echo1k | 40,955 | 0.60× | 1.00 | 3.0 | 48.2 |
| express-node | deep | 49,653 | 0.57× | 1.00 | 3.0 | 10.5 |
| express-node | files | 42,629 | 0.48× | 1.00 | 5.0 | 8.7 |
| express-node | missing | 44,944 | 0.52× | 1.00 | 3.0 | 16.9 |
| express-node | mixed | 43,600 | 0.52× | 1.00 | 4.0 | 9.2 |
| express-bun | json | 75,349 | 0.88× | 0.00 | 3.0 | 16.5 |
| express-bun | user | 79,915 | 0.94× | 0.00 | 2.0 | 16.9 |
| express-bun | echo64 | 62,005 | 0.88× | 0.00 | 2.0 | 16.0 |
| express-bun | echo1k | 55,301 | 0.81× | 1.00 | 3.0 | 65.0 |
| express-bun | deep | 79,179 | 0.90× | 0.00 | 2.0 | 16.8 |
| express-bun | files | 75,912 | 0.86× | 0.00 | 2.0 | 15.4 |
| express-bun | missing | 70,749 | 0.81× | 0.00 | 2.0 | 26.7 |
| express-bun | mixed | 64,821 | 0.78× | 0.00 | 3.0 | 13.7 |
| ch3-node | — | — | pending `src/` | | | |
| ch3-bun | — | — | pending `src/` | | | |
| ch3-scriptc | — | — | pending `src/` | | | |
| **ceilings** | | | | | | |
| go-chi | json | 106,837 | 1.24× | 0.00 | 2.0 | 12.7 |
| go-chi | user | 106,293 | 1.25× | 0.00 | 1.0 | 12.1 |
| go-chi | echo64 | 99,669 | 1.42× | 0.00 | 2.0 | 15.8 |
| go-chi | echo1k | 78,880 | 1.16× | 0.00 | 2.0 | 47.7 |
| rust-axum | json | 103,029 | 1.20× | 0.00 | 1.0 | 12.3 |
| rust-axum | user | 104,875 | 1.23× | 0.00 | 1.0 | 11.9 |
| rust-axum | echo64 | 103,200 | 1.47× | 0.00 | 1.0 | 16.3 |
| rust-axum | echo1k | 94,827 | 1.39× | 0.00 | 2.0 | 102.0 |
| c-mongoose | json | 106,485 | 1.24× | 0.00 | 1.0 | 9.9 |
| c-mongoose | user | 106,549 | 1.25× | 0.00 | 1.0 | 9.2 |
| c-mongoose | echo64 | 106,176 | 1.51× | 0.00 | 1.0 | 14.0 |
| c-mongoose | echo1k | 103,445 | 1.52× | 0.00 | 2.0 | 108.3 |

`missing` = framework-default 404 (counted as non-2xx by autocannon; zero socket errors/timeouts in every cell). `mixed` = uniform-random over the 100-route table (400-request shuffled sequence, identical across subjects).

## Footprint

| subject | cold start ms (median of 10, spawn→first 200) | RSS after 100k reqs | binary size |
|---------|----------------------------------------------|---------------------|-------------|
| raw-node | 75 | 102 MB | — |
| raw-scriptc | **3** | **3 MB** | **0.3 MB** |
| raw-bun | 8 | 30 MB | — |
| h3-node | 61 | 124 MB | — |
| h3-bun | 26 | 43 MB | — |
| hono-node | 67 | 115 MB | — |
| hono-bun | 14 | 40 MB | — |
| fmw-node | 58 | 88 MB | — |
| fmw-bun | 34 | 56 MB | — |
| express-node | 76 | 141 MB | — |
| express-bun | 69 | 75 MB | — |
| go-chi | 8 | 13 MB | 6.3 MB |
| rust-axum | 7 | 10 MB | 1.2 MB |
| c-mongoose | 3 | 2 MB | 0.1 MB |

## scriptc column — evidence

`apps/raw.ts` compiles statically (`scriptc coverage` → **63/63 statements, 100% static**) and the 361KB ELF serves every route (curl-verified before benching). Same source under `node` is the baseline — the ELF is 1.05–1.38× faster across cells with 3ms cold start and 3MB RSS.

Foreign frameworks, one attempt each (full output in `scriptc-evidence/`):

| app | coverage verdict | detail |
|-----|------------------|--------|
| h3 2.0.2 | TYPECHECK-BLOCKED | `h3.d.mts` needs DOM types (`HeadersInit`, `BodyInit`, `Crypto`, `MimeType`) — matches REPORT.md |
| hono 4.13 + @hono/node-server | **SURPRISE: 95% static, ELF builds** | typechecks and links (2.7MB ELF) — then throws `SC2020 Object.defineProperty` at adapter init. Furthest a real framework gets; still cannot serve |
| express 5.3 | TYPECHECK-BLOCKED | no bundled d.ts → SC0001 unresolved module (matches REPORT.md) |
| find-my-way 9.10 | island fallback | `fast-deep-equal` dep unsupported → SC2013 engine-required; app code 96% static otherwise |

Note on hono: REPORT.md recorded an SC3004 crash at coverage on an earlier surface. With the `.mjs` entry + `--npm-static hono --npm-static @hono/node-server`, both packages compile statically and a binary links — the wall moved from the checker to 80 deferred fence sites, the first of which (`Object.defineProperty` in the node-server adapter) fires at startup. Not a support path, but a much nearer miss than documented.

## Caveats

- Shared-VM noise ±50% on absolutes; ratios vs `raw-node` are the signal. GET cells cluster ≥ ~103k for bun/ceiling subjects — at that level the loopback+autocannon client is partly the limit, so sub-10% gaps there are not decisive.
- `raw-scriptc` user cell (1.05×) is closest to node — param-string JSON building is the same code path in both.
- express-bun outperforms express-node (~1.5×) — bun's node:http compat is that much cheaper; consistent with express being middleware-dispatch-bound rather than V8-bound.
- go-chi echo1k (78.9k) dips below its other cells — Go's net/http per-request body alloc shows at 1KiB.
- Cold-start method: spawn→first HTTP 200 on `/json`, median of 10 (see `lib/coldstart.mjs`) — uniform across runtimes and ELFs; hyperfine installed but spawn→200 is the honest server metric.
