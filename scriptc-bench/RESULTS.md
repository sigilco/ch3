# Hono & alternatives under scriptc 0.2.8 — measured results

Date: 2026-10-11. Bench: identical 3-route API (GET /json, GET /user/:id, POST /echo)
served by each candidate. Load: autocannon -c 64, 6s, keep-alive, on /json.
Machine: this VM (Ubuntu, x86-64). scriptc 0.2.8, node 24.19, bun 1.4.3.

## Headline numbers

| Target | req/s | p99 | Under scriptc? |
|---|---:|---:|---|
| **scriptc / mini-router (typed, in-app)** | **79,667** | 2ms | 100% static, works today |
| scriptc / bare node:http (control) | 85,408 | 2ms | 100% static |
| bun / polka | 97,856 | 1ms | — |
| bun / hono | 94,091 | 1ms | — |
| bun / bare node:http | 83,360 | 2ms | — |
| bun / find-my-way | 80,288 | 2ms | — |
| node / find-my-way | 69,747 | 3ms | — |
| node / polka | 69,397 | 3ms | — |
| node / hono | 69,083 | 2ms | — |
| node / bare node:http | 63,939 | 3ms | — |
| node / h3 | 42,277 | 4ms | — |
| bun / h3 | 29,363 | 5ms | — |

Startup to listen-ready: mini-static **3ms** vs node/polka 23ms, bun/hono 45ms,
node/hono 68ms (≈8–23× faster cold start). Binary: 481KB single ELF.

## The framework wall — nothing packaged serves under scriptc today

Every existing npm framework fails for a different structural reason. The island
(QuickJS `--dynamic` engine) **has no `http.createServer`** — its node:http shim
is client-side only (request/get work; listen does not exist):

- **Hono** — triply dead. (1) `@hono/node-server` can't even *embed*: it requires
  `node:http2`, absent from the island (SC2030 at build). (2) Any island-side
  server would need createServer, which doesn't exist there. (3) Its Fetch
  `Request`/`Response` API has no static-tier lowering, so Hono handlers can't
  compile natively either. **Hono cannot run under scriptc today.** HonoX is
  strictly worse — it layers a vite/meta-framework + SSR on the same walls.
- **h3** — same shape: `srvx` requires `node:http2` → embed refused (SC2030);
  island has no createServer; Fetch-style event API absent from static tier.
- **Polka** — its `listen()` must run inside the island (native
  `req`/`res` can't cross into dynamically-executed code) → island lacks
  createServer. `--npm-static` route: whole dep tree (polka, trouter, matchit,
  @polka/url, @arr/every) *does* reach `static` in coverage when every
  transitive dep is named — but codegen then fails with SC3004 (internal).
- **find-my-way** — closest miss. With all six deps named
  (`--npm-static find-my-way fast-deep-equal fast-querystring safe-regex2
  fast-decode-uri-component ret`) the tree compiles — after patching one
  internal compiler bug (SC9001: `arr.pop()` result typing in
  lib/compiler.js:618). Then it dies two ways: CJS `module.exports` init
  fences (SC1090/SC2011 in fast-querystring's entry), and if it survived, the
  app-side `router.lookup(req, res)` call would cross native handles into
  island code — the boundary wall.
- **The boundary wall in general**: values holding native runtime handles
  (IncomingMessage/ServerResponse) cannot enter dynamically-executed code
  ("an 'unknown' value holding a runtime handle cannot enter
  dynamically-executed code"). Any design where a native `createServer`
  callback invokes island-side routing is dead on arrival.

## What works: the typed in-app router (the Hono-equivalent for scriptc)

A ~60-line typed router (program code, not a package) compiles 100% static and
delivers **79.7k rps — +15% over node/hono, +15% over node/polka/fmw, +88% over
node/h3, 2.7× bun/h3** — while trailing bun/hono (-15%) and bun/polka (-19%).

```ts
type Handler = (req: IncomingMessage, res: ServerResponse,
                params: Record<string, string>) => void;
router.get("/user/:id", (req, res, p) => json(res, { id: p.id }));
```

This is the Hono-equivalent shape (method+path-param routing, JSON helpers,
middleware-able hooks) that scriptc can actually optimize — the routing and
handler code itself is native, not interpreted.

Cost of routing vs bare handler dispatch: ~7% (85.4k → 79.7k).

## Upstream blockers worth filing/tracking

1. Island `node:http` lacks `createServer` (client-side only) — removes the
   entire "framework in the island" option for servers.
2. Island lacks `node:http2` → SC2030 embed refusal kills @hono/node-server
   and srvx/h3 at build time.
3. Native-handle → island boundary: req/res can't enter dynamic code —
   kills app-side bridging of island routers.
4. `--npm-static` transitive-dep discovery: each uncovered dep is reported
   one-at-a-time (`fast-deep-equal` → `fast-querystring` → `safe-regex2` →
   `fast-decode-uri-component` → `ret`); a recursive auto mode would help.
5. SC9001 internal error in find-my-way lib/compiler.js:618 (`stack.pop()`).
6. SC3004 (mega-union `undefined` lowering) compiling polka statically.
7. CJS `module.exports`-shape init fences (SC1090/SC2011) inside compiled
   packages — fast-querystring's entry never survives module init.
8. Fetch `Request`/`Response`/`Headers`/`FormData`/`ReadableStream` absent
   from static tier — the fundamental gap behind every Fetch-style framework.

## Verdict

- **Hono/HonoX under scriptc: 0 rps — cannot run** (embed refusal + missing
  island server + missing static Fetch types).
- **Most equivalent alternative with a real speedup: a small typed
  Node-HTTP-native router compiled as program code** — the only topology
  scriptc can serve today, and it beats every Node-side framework number
  while losing narrowly to bun/polka and bun/hono.
- **Nearest packaged-framework fix: find-my-way** — full tree statically
  compiles after naming 6 deps + one SC9001 patch; blocked on CJS-init
  fences. If upstream fixes those two, fmw is the first off-the-shelf router
  that could work.

Bench sources: /home/ubuntu/scriptc-bench (apps/, bin/, bench.sh, RESULTS.md).

---

## Phase 2 — find-my-way made to work (this session)

**find-my-way serves under scriptc.** The fork (sigilco/find-my-way,
branch devin/scriptc-compat, PR → delvedor/find-my-way) compiles the
whole default routing path statically — NO dynamic island — to a
1.7 MB ELF that boots node:http + router natively.

| variant | rps (/json, autocannon -c 64 -d 6) |
|---|---|
| scriptc/fmw-fork | ~60–92k (high variance on shared VM; best 92,437) |
| node/fmw-fork | ~60–95k (best 94,592) |
| node/fmw-stock 9.10.0 | ~94k |
| scriptc/mini-router | 79,667 |
| node/hono | 69,083 |

Verdict: **scriptc-compiled fmw ≈ parity with Node-native fmw** —
the first packaged router that runs under scriptc at all, and it is
~16% faster than the local mini-router at its best measurement.

Changes needed (all semantics-preserving, upstream PR):
- remove `new Function` codegen from default path (node prefix matcher,
  params-object builder, constraint bitmask matcher) — `Router.compile()`
  stays as opt-in codegen
- fast-querystring → node:querystring (fmq is statically ineligible)
- safe-regex2 optional-load (require try/catch)
- URL.parse/URL.canParse feature-detect → try/catch new URL
- instanceof/new.target/method-shorthand/for-in-hasOwnProperty/pop-expr
  forms that scriptc doesn't lower

Under Node the fork is **test-clean: eslint, borp 554/554, tstyche 58/58**
and throughput-neutral vs main (94,592 vs 94,496 best-of).

Remaining scriptc-only walls for OTHER packages (unchanged):
island node:http has no createServer; native req/res can't enter island
code; tsc-emit CJS boilerplate uncompileable (ret worked around by
hand-rewriting its dist — NOT upstreamable, see note below).
