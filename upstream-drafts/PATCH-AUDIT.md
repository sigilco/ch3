# Vendor-patch audit — rou3 + memoirist under scriptc 0.2.8

Date: 2026-10-11 · Method: clean clone + published dist patched in place until the probe
(node:http server, `GET /json` static + `GET /user/:id` param, **plus full-API dbg apps**
covering wildcard, `**`, removeRoute, findAllRoutes, optional params, onParam, `__proto__`
params, loosePath, regex segments) compiles with `scriptc build <app> --npm-static <pkg>`
— **no `--dynamic`** — and serves byte-identical output to the same code on node v24.19.

## Headline: the survey's patch counts were inflated by `--dynamic`

The survey built probes with `--dynamic --npm-static <pkg>`. Every error it reported
(SC1090 "into dynamically-executed code", `Object.create(null)` throw, method-value
`charCodeAt`, chained `a=b=c`) is an **island-boundary artifact** — none reproduce on a
pure-static build. Rebuilt from scratch:

- **memoirist 1.2.3: 1 patch total** (and **0** for the required probe — only the
  optional-params branch needs it). Serves ~98k rps.
- **rou3 0.7.12: 3 patch classes / 9 edit sites** (root cause: *one* mechanism). Serves
  ~99k rps, bit-identical behavior to node on every API exercised.
- No `.d.mts`/`.d.ts` rewrites needed. Both ship concrete types already; `| undefined`
  unions compile fine inside a purely static program.

Why memoirist nearly compiles out of the box: its `createNode`/`createParamNode`/
`resetNode` already initialize **every** field at literal creation (`store: null,
paramStore: null, inert: null, ...`). That is exactly the rule rou3 violates — and the
single most important ch3 rule this audit adds (below).

## rou3 0.7.12 — patch table

| # | Site (dist/index.mjs) | Patch | Class | Action |
|---|---|---|---|---|
| R1a | `{key:""}` root, `{key:"**"}`, `{key:"*"}`, `{key:segment}` (4 sites) | Route all node creation through `createNode(key)` factory | **(a) upstreamable** | `devin/rou3-improvements` on `main` — `patches/0001-*.patch` |
| R1b | same factory, dist only | Dead-branch union widening (`key === "\0" ? <real value> : null`) so slots accept objects | **(c) never upstream** | ch3 rule: "declare full object shape at literal creation; widen slot unions with an impossible condition, never post-creation" |
| R2 | `data: data \|\| null` | `data ? data : null` — `||` mixing `T\|undefined`→`null` hits SC1042 when `T` instantiates to a primitive | **(c) never upstream** | Semantically identical; only uglier. ch3 rule: "avoid `\|\|` between a generic and `null` — use ternary" |
| R3 | `_remove`/`_isEmptyNode`: 4× `= void 0` / `=== void 0` on node fields | `= null` / `=== null` | **(b) risky/debatable** | Internal fields only, API semantics unchanged. Smallest safe variant: keep `undefined` in any *public* return (`findRoute` still returns `undefined`); use `null` only inside the tree. Do not send upstream alone |

Notes: `?.`, `??=`, `in`, `Object.keys`, `Object.create(null)`, `Object.freeze`,
`delete`, `match.groups` for-in, `Array.find`, and `ctx.static` dict writes all lower
correctly — the report's claims that several of these fail were `--dynamic` artifacts.
`compiler.mjs` (`new Function`) is untouched: it's the JIT; `compileRouterToString` is
already the CSP-safe AOT path, nothing to send upstream.

### Upstreamable candidate (a): `createNode` factory

**Patch:** `patches/0001-refactor-create-trie-nodes-through-one-factory.patch`
(branch `devin/rou3-improvements` off `main` @ v1.0.0 — applies to the rewritten
codebase, where the same pattern now spans **6** literals: root, wildcard, param,
static child, `suffix`, and two suffix-trie inserts.)

Tests: `tsc --noEmit` clean, `pnpm vitest run` 3872 pass / 1 pre-existing env failure
(wpt URLPattern percent-encoding — fails identically on unmodified `main`, Node 24.19
URLPattern behavior), lint+format clean.

**Honest cost:** +11 B bundle, +9 B gzip — the helper outweighs the literals it
replaces. The patch bumps `test/bench/bundle.test.ts`'s budget by the delta; a
maintainer may still reject on size. Marginal-value (a), not a sure accept.

**Issue text (maintainer-facing):**

> **Refactor: route trie-node creation through one factory**
>
> Six sites construct `Node` objects by literal (`createRouter`'s root, the
> wildcard/param inserts, the static-child insert, and both suffix-trie inserts in
> `_insert`). Each names the full shape inline. Centralizing them behind a small
> `createNode(key)` factory in `context.ts`:
> - keeps every node's created shape uniform — one hidden class instead of several
>   literal-site shapes (matching how `NullProtoObj` already centralizes the
>   dictionary shapes), and
> - gives future `Node` fields a single initialization site (the interface has grown
>   `suffix`/`hasSuffix`/`hasRegexParam` recently; each was added at N sites).
>
> Cost: ~11 B (+9 B gzip) of bundle — the helper outweighs the slightly shorter
> literals it replaces; the bundle budget is bumped by exactly that delta. If size
> wins, feel free to close; the dedup is the argument, not a must-have.

## memoirist 1.2.3 — patch table

| # | Site (dist/index.mjs) | Patch | Class | Action |
|---|---|---|---|---|
| M1 | `add()`: `path.slice(1).split("/")` in the optional-params branch | `String(path).slice(1).split("/")` — `path` arrives `unknown` at this instantiation → "array slice end of 'unknown' values" (SC2020) | **(c) never upstream** | `path` is `string`-typed upstream; the coercion is redundant. ch3 rule: "coerce `unknown`-arriving params to `String(x)` at the *use site* (a fresh local), not by reassigning the param — reassignment doesn't narrow the declared type" |
| — | `root = Object.create(null)`, `seedParams` `Object.create(null)` (nullProto paths) | none needed | — | works under scriptc; `__proto__` param names verified (`/p/:__proto__` → `{"__proto__":"x"}`) |
| — | `node = this.root[method] = createNode("/")` chained assign | none needed | — | compiles and runs correctly on static builds; the survey's SC1090 was island-boundary only |
| — | `.d.ts` | untouched | — | stock types compile |

**Total: 1 upstreamable-worthy patch class across both packages** (the rou3 factory,
marginal). memoirist contributes zero — it is already authored in the shape scriptc
wants, which is precisely why it's the best "buy" signal in the survey.

## Verified numbers (this VM, autocannon -c64 -d4 `/json`)

| binary | rps |
|---|---|
| scriptc / rou3-0.7.12-patched | ~99k |
| scriptc / memoirist-1.2.3-patched | ~98k |
| (survey VM, for reference) | rou3 95.6k, memoirist 104.9k, baseline 109.7k |

## Appendix — ch3 authoring rules (merged: subset rules + this audit's (c)-class hacks)

The numbered subset rules from the playbook all hold; this audit adds/qualifies:

1. **Declare every object's full shape in its literal.** A field added later stores a
   *boxed copy* invisible to reads on other paths (rou3's tree silently lost
   `static`/`param`/`methods` — routes registered, lookups 404ed). Node factories like
   memoirist's `createNode`/`resetNode` are the correct shape.
2. **Widen a slot's union at the literal, not after.** `field: null` pins the slot to
   `null`; later writes of objects throw `TypeError: expected null | undefined … got
   object`. Produce the union inline: `field: <impossible cond> ? <real value> : null`
   (e.g. `key === "\0"`), so the stored type and written type are the *same shape*.
3. **Storing a different-shaped object into a slot boxes away its extra fields** — the
   dead-branch value must come from the same factory (`createNode`), not any object.
4. **No re-read needed once shapes are complete.** `node = node.static[s]` is only
   necessary when the field itself was boxed (rule 1 violated). Prefer fixing shape.
5. **`||` between a generic `T` and `null`** fails to lower when `T` instantiates to a
   primitive (SC1042) — write `data ? data : null`. (`??` may dodge this; mainline rou3
   already uses `data ?? (null as T)`.)
6. **Coerce `unknown`-arriving params at the use site with `String(x)`/`Number(x)`**,
   binding a fresh local; `param = String(param)` does NOT narrow the declared type.
7. **`undefined` is fine at public API boundaries** on pure-static builds —
   `MatchedRoute | undefined`, `params?:` compiled and behaved correctly. The
   "`null`, never `undefined`" rule applies to *object slots inside the compiled
   graph* (rule 2), not to function returns crossing into authored code.
8. `?.`, `??=`, `in`, `delete obj[k]`, `Object.keys`, `Object.create(null)`,
   `Object.freeze`, `Array.prototype.find`, `for…of` over arrays/tuples, and
   `match.groups` for-in **all lower** — don't waste patch budget on them.
9. `new Function` is still unlowered (SC2020) — ch3 ships no codegen path on the
   compiled route; AOT-string output (rou3's `compileRouterToString` pattern) is the
   acceptable alternative.
