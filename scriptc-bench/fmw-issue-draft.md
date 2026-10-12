# find-my-way under AOT-compiled runtimes (vercel-labs/scriptc): compatibility findings + fix

Companion to PR <PR_URL> (from `sigilco/find-my-way`, branch `devin/scriptc-compat`).

## TL;DR

find-my-way's **default** routing path can be made fully AOT-compilable — we got it serving under `scriptc` 0.2.8 (TypeScript/JS → native ELF) at **rough parity with Node-native find-my-way** on the same workload. The required changes are small and semantics-preserving under Node; they are the PR linked above.

## Verified numbers

`autocannon -c 64 -d 6` keep-alive, same `node:http` + router app on both sides (shared-VM noise is ±50% run-to-run; best-of and medians agree):

| variant | rps |
|---|---|
| `node` + find-my-way `main` (9.10.0) | ~94k (best 94,496) |
| `node` + find-my-way fork | ~94k (best 94,592) — **patch is perf-neutral on Node** |
| **`scriptc` 0.2.8 + find-my-way fork** (fully static, no JS engine) | **~92k (best 92,437) — ≈parity with Node** |

Binary: 1.7 MB self-contained ELF, ~3 ms cold start, zero embedded JS engine.

## What blocks scriptc compilation today (package-specific)

1. **`new Function` codegen on the default path.** `lib/node.js compilePrefixMatch` (prefixes 2–15 chars), `lib/handler-storage.js _compileCreateParamsObject` and `_compileGetHandlerMatchingConstraints` all emit source at runtime. AOT compilers cannot lower `new Function` — but note `Router.compile()` is already opt-in, so only these *default-path* uses needed equivalents. The PR replaces them with closures over precomputed `{mask, store, mustMatch}` triples and `String#indexOf` — measured perf-neutral on Node.
2. **`require('fast-querystring')`** — that package's entry shape does not statically compile anywhere; `node:querystring` is a drop-in for the flat-query usage here (kept as a devDependency for the custom-parser test).
3. **`require('safe-regex2')` at module init** — its `ret` dep is tsc-emitted CJS (`exports.X = void 0`/`__importStar` boilerplate) which is uncompileable as shipped. The PR loads it optionally (`try/catch` → `null`): runtimes that can't load it skip the safety check (equivalent to `allowUnsafeRegex`); under Node nothing changes.
4. **Feature-detect on `URL.parse`/`URL.canParse`** — replaced with `try/catch` around `new URL`, same null-on-malformed contract.
5. **One-off unlowered forms**: `this instanceof Router`, `new.target`-style constructor guards, `for..in`+`hasOwnProperty` over the `httpMethods` array, object-shorthand / method-shorthand spellings, `stack.pop()` used in expression position. All trivial rewrites in the PR.

## Reproduction

```bash
npm i -g scriptc            # needs clang for codegen
# checkout the PR branch of sigilco/find-my-way as 'find-my-way' in node_modules
scriptc build server.js \
  --npm-static find-my-way --npm-static fast-deep-equal \
  --optimization=speed -o server
./server  # serves /json, /user/:id, POST /echo natively
```

`--dynamic` is NOT needed and counterproductive: the embedded engine has no `createServer` and native `req`/`res` handles cannot enter it.

## Why upstream might want this even without scriptc

- The default path becomes free of runtime code generation → works under strict `script-src 'self'` CSP without `unsafe-eval`.
- One fewer runtime dependency; safe-regex2 failure becomes graceful degradation.
- `Router.compile()` remains available for maximum lookup speed where `new Function` is permitted.
