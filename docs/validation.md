# Validation

HTTP APIs almost always want runtime validation at the edge. This page covers
what validation costs ch3, which [Standard Schema](https://standardschema.dev)
libraries can reach ELF mode with it, and `@ch3/val` — the subset-native
validation library that ships in this repo because no npm library can.

## TL;DR

| Mode                      | Validation             | Throughput (POST /order, `-c64 -d6 ×3`, median)    |
| ------------------------- | ---------------------- | -------------------------------------------------- |
| Node (`node apps/*.ts`)   | none (read body only)  | ~72k req/s                                         |
| Node                      | `JSON.parse` only      | ~65k req/s                                         |
| Node                      | valibot `safeParse`    | ~58.5k req/s (**−18%** vs body, **−10%** vs parse) |
| Node                      | `@ch3/val` `safeParse` | ~57.9k req/s (same band as valibot)                |
| **ELF** (`scriptc build`) | none                   | ~97–104k req/s                                     |
| **ELF**                   | valibot                | **does not run** (see below)                       |
| **ELF**                   | `@ch3/val` `safeParse` | **~73k req/s** (−26% vs unvalidated ELF)           |

- **In Node mode, validation is not a heavy tax.** A realistic order schema
  (nested strictObject + uuid + email + pipe actions) costs ~10–18% of request
  throughput — comparable to what `JSON.parse` itself costs. Any Standard
  Schema library works fine here; pick on API taste.
- **In ELF mode, no npm validation library works.** scriptc 0.3.0 rejects or
  miscompiles every candidate we probed (details below). The only way to
  validate inside a compiled ch3 binary today is `@ch3/val`.
- **`@ch3/val` + ch3 ELF ≈ 73k req/s with full validation** — still ~25%
  faster than ch3 + valibot running in Node, and every request is schema-checked.

## Why npm libraries can't reach ELF

scriptc compiles the program's own TypeScript in "program-code" mode (what
makes ch3 hit 100k+ req/s). npm dependencies either need `--npm-static`
vendoring (a 40–70% throughput cliff for ch3 itself — see
`bench/RESULTS-compiled-mode.md`) or fail outright. Probed against
scriptc 0.3.0:

| Library               | `scriptc coverage`                           | Verdict                                        |
| --------------------- | -------------------------------------------- | ---------------------------------------------- |
| **zod** v4            | crashes the compiler                         | refused                                        |
| **zod** v3            | 1 blocker (`ZodError` `instanceof` override) | refused                                        |
| **arktype**           | refused                                      | not in subset                                  |
| **typebox**           | refused                                      | not in subset                                  |
| **effect**            | refused                                      | not in subset                                  |
| **ajv**               | refused                                      | not in subset                                  |
| **yup**               | refused                                      | not in subset                                  |
| **superstruct**       | refused                                      | not in subset                                  |
| **valibot**           | 99% static                                   | **compiles standalone — poisons the host app** |
| find-my-way (control) | refused                                      | not in subset                                  |

**The valibot trap deserves detail.** valibot compiles `static` at 99%
coverage and its schemas run correctly in a standalone scriptc binary. But
the moment a program-code application _imports_ valibot, scriptc lowers the
program's own class instantiations differently: `new Context()`/`new ReqView()`
come out as dynamic objects, every prototype method lookup fails
(`c.json is not a function`), every route 500s, and the binary crashes on
the second request. A bare `import "valibot"` — never calling a single
valibot function — is enough to trigger it. `--npm-static valibot` fails
identically. `import type` is the only safe import.

Two extra valibot-specific fences found along the way, if upstream ever
fixes the import problem: `minValue`/`maxValue`/`gtValue`/`ltValue`/`value`/
`notValue(s)` throw at _schema construction_ under scriptc (their `expects:`
ternary touches `Date.prototype.toJSON`, a per-statement SC2020 fence), and
`cache()`/`cacheAsync()` use `isFinite` via `_LruCache`.

## `@ch3/val`

`packages/val` is a minimal Standard Schema v1 library written inside the
same compilable subset as ch3. `scriptc coverage` on a ch3 app using it:
**100% static** — every schema, action, and dispatch lowers to native code.

API mirrors valibot where the subset allows (~70–80% of the surface REST
apps use):

```ts
import * as v from "@ch3/val";

const Item = v.strictObject({
  sku: v.pipe(v.string(), v.minLength(1)),
  qty: v.pipe(v.number(), v.integer(), v.minValue(1)),
  price: v.pipe(v.number(), v.finite()),
});

const Order = v.strictObject({
  id: v.pipe(v.string(), v.uuid()),
  email: v.pipe(v.string(), v.email()),
  items: v.pipe(v.array(Item), v.minLength(1)),
  note: v.optional(v.pipe(v.string(), v.maxLength(200))),
  express: v.boolean(),
  coupon: v.nullable(v.string()),
});

const r = v.safeParse(Order, JSON.parse(c.req.body()));
// r = { success, output, issues } — issues carry type/expected/received/
// message/path, paths are plain key arrays: ["items", "1", "qty"]
```

Shipped surface: `string` `number` `boolean` `any` `unknown` `never`
`literal` `picklist` `nullable` `optional(+Str/Num/Bool defaults)` `nullish`
`array` `tuple` `object` `looseObject` `strictObject` `record` `union`
`custom` `pipe` — actions `minLength` `maxLength` `length` `nonEmpty` `empty`
`regex` `email` `uuid` `url` `ipv4` `digits` `startsWith` `endsWith`
`includes` `integer` `finite` `safeInteger` `minValue` `maxValue` `gtValue`
`ltValue` `multipleOf` `check` `transform` `trim` `trimStart` `trimEnd`
`toLowerCase` `toUpperCase` `toMinValue` `toMaxValue` — entry points
`parse` `safeParse` `is` `assert` `flatten` `summarize` `VError` `InferOutput`
— plus spec-conformant `schema["~standard"] = { version: 1, vendor: "val",
validate }`.

### Deliberate divergences (subset-forced)

- Results are plain records (`{ success, output, issues }`), not classes —
  class fields can't hold `unknown`/`any`/`object`/record-of-unknown/`unknown[]`
  values under scriptc at all.
- `VIssue` has no `input` member (a valibot extension, not spec-required).
- `literal()` and `optional()` defaults accept string/number/boolean/null.
- `optional` with a default is `optionalStr`/`optionalNum`/`optionalBool`
  (defaults live in typed slots).
- `InferOutput` resolves concretely for `string`/`number`/`boolean` schemas;
  objects/arrays/wrappers resolve to open record types (generic phantom
  fields can't compile, and method-return narrowing is limited to subclasses).
- No `Date`/`File`/`Map`/`Set` schemas, no async schemas, no `enum_` object
  (use `picklist`).

### How it stays fast

Kind-tagged schema classes (same pattern as ch3's `Context`/`ReqView`) with a
module-level `VFail` sentinel for failure identity — no exception or record
allocation on the happy path beyond the output record; `path` is a shared
push/pop stack. Validation costs ~26% of ELF request throughput on the bench
schema, i.e. ~73k req/s vs ~97–104k unvalidated — and it's absolute-faster
than running valibot in Node (~58k).

## Recommendation

- **Node/distributed builds:** use any Standard Schema library you like —
  validation isn't the bottleneck (~−10%).
- **ELF builds:** `@ch3/val` is currently the only way to validate inside the
  binary. If upstream scriptc fixes the program-code/npm class poisoning,
  re-evaluate valibot — but only with the `minValue`-family avoid-list above.

## Reproduce

```sh
scriptc coverage bench/apps/ch3-val.ts        # 100% static
scriptc build bench/apps/ch3-val.ts -o bench/bin/ch3-val --optimization=speed
./bench/bin/ch3-val 3053                      # POST /order, GET /json
node bench/apps/ch3-val.ts 3021               # same app in Node mode
```

Bench subjects: `bench/apps/ch3-val.ts` (validated), `ch3-parseonly.ts`
(JSON.parse only), `ch3-postplain.ts` (body only), `ch3-valibot.ts` (valibot
counterpart — Node only). Numbers: `bench/RESULTS-validation.md`.
