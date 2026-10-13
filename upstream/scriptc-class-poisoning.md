# Upstream bug report — scriptc: npm-package import poisons program-code class instantiation

Draft for filing against scriptc (`sigilco`'s TS→ELF compiler). Verified on
**scriptc 0.3.0**, Linux x86_64, `clang` shim → `zig cc`. Repro lives in this
repo: `bench/apps/ch3-valibot.ts` (broken) vs `bench/apps/ch3-val.ts`
(working via `@ch3/val`).

## Summary

When a program-code application imports `valibot` — even a bare side-effect
`import "valibot"` never calling any valibot function — every instantiation
of the **program's own classes** in the request path silently lowers to a
dynamic object without methods. The build reports fully static coverage; the
binary miscompiles at runtime only.

## Minimal repro

```ts
// app.ts — ch3 router + one import, nothing else
import { createRouter } from "ch3"; // or ../../packages/ch3/src/index.ts
import "valibot";                   // bare side-effect import — never used

const app = createRouter();
app.get("/json", (c) => c.json({ hello: "world" }));
app.serve({ port: 3000 });
```

```sh
scriptc coverage app.ts     # reports fully static / valibot: static — no warning
scriptc build app.ts -o app --optimization=speed
./app 3000 &
curl localhost:3000/json    # → Internal Server Error  (expected {"hello":"world"})
curl localhost:3000/json    # → Internal Server Error  (and crashes in the fuller app)
```

Deleting the `import "valibot"` line makes the identical binary work.

## Runtime signature

Instrumented with an `onError` handler, the per-request error is:

- `c.json is not a function` — the `Context` instance handed to the handler
  is a record-like object missing its prototype methods.
- On the fuller app (`ch3-valibot.ts`): `rv._setBody is not a function` —
  same shape for `ReqView`, then the process dies on the second request.

So it's not that valibot's own code fails — **program-side `new` sites for
program-declared classes** produce dynamic objects once valibot joins the
import graph. Coverage says 100% static, i.e. the wrong lowering is silent.

## What was ruled out (bisection matrix)

All probes: same ch3 app + one npm import, built `--optimization=speed`,
curl `GET /json`.

| Import                                                         | Result               |
| -------------------------------------------------------------- | -------------------- |
| `import "valibot"` (bare, unused)                              | **broken**           |
| `import * as v from "valibot"` + `v.safeParse`                 | broken               |
| `--npm-static valibot`                                         | broken (identically) |
| `import type` of valibot                                       | clean                |
| trivial pkg (2 exports)                                        | clean                |
| pkg with classes + `extends Error` + `instanceof`              | clean                |
| pkg with record literals containing functions/methods          | clean                |
| pkg with `~standard`/`~run` tilde-keyed members                | clean                |
| generated pkg with 3000 exported functions                     | clean                |
| pkg with `isFinite(unknown)`-style call                        | clean                |
| valibot standalone (no ch3): `v.safeParse` in a scriptc binary | **works**            |

So: not npm-presence, not npm classes, not records-with-functions, not
tilde keys, not module size, not a lone deferred fence. Something specific
in valibot's `dist/index.mjs` (~4.5k lines) flips the program-class
lowering. Valibot's own module is fine standalone — the bug is cross-module.

## Valibot-specific fences (second-order; matter even after this is fixed)

If the poisoning is fixed, these valibot APIs still hit separate fences —
document so the fix session can regression-test the full schema surface:

- `v.minValue/maxValue/gtValue/ltValue/value/values/notValue/notValues` —
  their `expects:` builder is
  `` `${requirement instanceof Date ? requirement.toJSON() : _stringify(requirement)}` ``;
  the whole ternary statement throws **SC2020** at _schema construction_
  (fence granularity is per-statement, not per-branch — fires even for
  numeric requirements).
- `v.cache()`/`v.cacheAsync()` — `_LruCache` uses `isFinite(unknown)`
  (**SC2012** deferred site; throws if reached at runtime).

## Fix-plan for the future session

1. Reproduce with the minimal app above (12 lines + `npm i valibot`).
2. Bisect valibot's `dist/index.mjs` into a local stub package:
   copy `node_modules/valibot` → `stubpkg`, then shrink its export surface
   (half-split on exported names, then on top-level declarations) until the
   poison stops/starts. The per-export `.d.ts` must be kept consistent.
   Expected outcome: one declaration family (or one construct) that flips
   program-class lowering when present in the npm static graph.
3. Likely suspects to check first inside scriptc: shared lowering path for
   `new` expressions vs object literals once an npm module introduces
   shapes program-code doesn't emit (optional chaining `?.`, getters,
   `Object.*` reflection, generators, `Symbol` keys) — any "dynamic
   objects exist in graph ⇒ lower all construction dynamically" merge
   rule would produce exactly this signature.
4. Regression gate after fix: `bench/apps/ch3-valibot.ts` must serve
   `{"hello":"world"}` on repeated requests AND validate POSTs
   (`{"ok":true,"items":2}` / `{"issues":5}` like `bench/apps/ch3-val.ts`).
5. Secondary items (separate issues if confirmed): the SC2020 per-statement
   granularity for `instanceof Date ? ...toJSON()` ternaries, and whether
   `isFinite(unknown)` can stay deferred vs needing the SC2012 fence.

## Interim workaround shipped in this repo

`packages/val` (`@ch3/val`) — a Standard Schema v1 library authored inside
the compilable subset; covers ~70–80% of the valibot API used by REST apps,
100% static coverage, ~73k req/s validated POSTs in ELF mode. See
`docs/validation.md`.
