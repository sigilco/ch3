---
name: chttp-app-dev
description: Authoring chttp server code that stays inside the scriptc compilable subset, for apps intended to compile to a native ELF via scriptc. Use when writing or modifying handlers, middleware, route registrations, or validation code for a chttp app that must pass `scriptc coverage` and `scriptc build`. Triggers include "chttp app", "scriptc subset", "coverage failed", "lowering error", or any server code that will be compiled with scriptc.
---

# chttp app development (scriptc subset)

Canonical sources, in precedence order: root `AGENTS.md` (subset rules),
`ARCHITECTURE.md` section 0 (rationale), `docs/route-contract.md` (emit seam),
`docs/validation.md`, `docs/middleware.md`. This file is a condensed index;
when it disagrees with those, those win.

## When to use

Writing or changing server code (handlers, middleware, route registration,
validation) for a chttp app that must compile via `scriptc build`. Plain-TS
code that never enters a scriptc build (tests, tooling, side-channel emits)
is exempt.

## Subset quick reference

| Rule | Do | Not |
| --- | --- | --- |
| Nullability | `string \| null` | `undefined` (SC3004) |
| Loops | indexed `for`, `for...of` over arrays | `for...in` |
| Collections | plain `({})` records | `Map`, `Set`, `Object.create(null)`, `Object.freeze` |
| Syntax | explicit keys, `&&`/`=== null` | shorthand props/methods, spread, `?.`, default params |
| Records | data only; classes for behavior | function values inside records (SC1090 poisoning) |
| Promises | `await`-join settle pattern only | `.then` read as value, `instanceof Promise` (SC1090), Promise/non-Promise union arms (SC2009) |
| Coercion | `String(x)` / `Number(x)` at function entry | trusting `unknown` params |
| Recursion | explicit frame stacks | recursive calls |
| Buffers | `Buffer.concat(Buffer[])` (lowers as of scriptc 0.3.1); accumulate `toString()` + `join` for strings | none |
| Strings | `charCodeAt(i)` | `s[i]` indexing (banned) |

Handlers may be `async`; the dispatch seam itself (`dispatch(req, res):
boolean`) stays synchronous. `null`/`undefined`/`c` returns keep the
zero-microtask path.

## Route registration patterns

```ts
const app = createRouter();

app.get("/user/:id", (c) => c.json({ id: c.req.param("id") }));
app.post("/echo", (c) => c.text(c.req.body()), { body: true });
app.all("/any", handler);
app.on("m-search", "/custom", handler);
app.route("/api", subApp);   // same-file mounts extract; cross-module mounts bail
```

- A handler reading `c.req.body()` must register with `{ body: true }`, or it
  receives `''`. No declaration, no buffering.
- Middleware (`app.use`) applies to routes registered **after** it (snapshot
  semantics). Order registration accordingly.
- For route lowering to extract a route, its path must be a literal.
  Variables, spreads, conditional or loop-driven registration bail to runtime
  dispatch with a build warning. Never "fix" this by making the emitter guess.

## Validation

`@chttp/val` is the only validator that compiles alongside a chttp ELF
(npm validators cannot). It is authored in the same subset, so schema
definitions must obey the table above too:

```ts
import * as v from "@chttp/val";

const Order = v.strictObject({ id: v.pipe(v.string(), v.uuid()) });
app.post("/order", (c) => {
  const r = v.safeParse(Order, JSON.parse(c.req.body()));
  return r.success
    ? c.json({ ok: true })
    : c.status(400).json({ issues: r.issues });
});
```

## Build and verify loop

Run in this order; do not skip steps:

1. `tsc --noEmit` (or the project typecheck script).
2. `node --test` on the app's tests.
3. `scriptc coverage` over the entry. It must report **100% static**; any
   deferred site is a subset violation to fix in source, not something to
   suppress.
4. `scriptc build` with `--npm-static @chttp/router`.
5. Curl smoke test against the binary (static route, param route, POST body
   route, miss/404).

For plugin emit changes, `fixtures/vite-app` must build before the change
lands (`packages/unplugin/AGENTS.md`).

## Bench etiquette

Any performance claim requires re-running the relevant bench cell first; the
baseline is `bench/RESULTS-v2.md`. Compare ratios, not absolute numbers, and
follow `bench/REPRODUCE.md` discipline. Never quote a number from memory.

## Deeper docs

- `AGENTS.md` and `ARCHITECTURE.md` section 0: subset rules and rationale
- `docs/route-contract.md`: frozen seam between runtime and generated dispatch
- `docs/validation.md`: val in node vs ELF
- `docs/middleware.md`: middleware recipes
- `README.md`: API surface overview
