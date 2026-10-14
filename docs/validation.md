# Validation

Runtime validation at the edge. In Node mode any [Standard Schema](https://standardschema.dev) library works. npm schema libraries do not compile into a chttp ELF, so the repo ships `@chttp/val`, a subset-native Standard Schema library. `@chttp/val` itself is verified to compile from its packed npm tarball (with `@chttp/router`) into a native ELF by `pnpm smoke:pack`.

## TL;DR

| Mode                      | Validation             | Throughput (POST /order, `-c64 -d6` x3, median) |
| ------------------------- | ---------------------- | ----------------------------------------------- |
| Node (`node apps/*.ts`)   | none (read body only)  | ~72k req/s                                      |
| Node                      | `JSON.parse` only      | ~65k req/s                                      |
| Node                      | `@chttp/val` `safeParse` | ~57.9k req/s (same band as valibot)             |
| **ELF**                   | `@chttp/val` `safeParse` | **~73k req/s** (-26% vs unvalidated ELF)        |
| **ELF** (`scriptc build`) | none                   | ~97-104k req/s                                  |

- In Node mode validation costs ~10-18% of request throughput, comparable to what `JSON.parse` itself costs. Pick any Standard Schema library on API taste.
- In ELF mode `@chttp/val` is the way to validate inside the compiled binary.

## `@chttp/val`

`packages/val` is a minimal Standard Schema v1 library written inside the same compilable subset as chttp. `scriptc coverage` on a chttp app using it: **100% static**.

API mirrors [valibot](https://github.com/open-circle/valibot) where the subset allows:

```ts
import * as v from "@chttp/val";

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

Shipped surface: `string` `number` `boolean` `any` `unknown` `never` `literal` `picklist` `nullable` `optional(+Str/Num/Bool defaults)` `nullish` `array` `tuple` `object` `looseObject` `strictObject` `record` `union` `custom` `pipe`, actions `minLength` `maxLength` `length` `nonEmpty` `empty` `regex` `email` `uuid` `url` `ipv4` `digits` `startsWith` `endsWith` `includes` `integer` `finite` `safeInteger` `minValue` `maxValue` `gtValue` `ltValue` `multipleOf` `check` `transform` `trim` `trimStart` `trimEnd` `toLowerCase` `toUpperCase` `toMinValue` `toMaxValue`, entry points `parse` `safeParse` `is` `assert` `flatten` `summarize` `VError` `InferOutput`, plus spec-conformant `schema["~standard"]`.

### Deliberate divergences

- Results are plain records (`{ success, output, issues }`), not classes.
- `VIssue` has no `input` member.
- `literal()` and `optional()` defaults accept string/number/boolean/null.
- `optional` with a default is `optionalStr`/`optionalNum`/`optionalBool`.
- `InferOutput` resolves concretely for `string`/`number`/`boolean` schemas; objects/arrays/wrappers resolve to open record types.
- No `Date`/`File`/`Map`/`Set` schemas, no async schemas, no `enum_` object (use `picklist`).

### How it stays fast

Kind-tagged schema classes (same pattern as chttp's `Context`/`ReqView`) with a module-level `VFail` sentinel for failure identity, and a shared push/pop `path` stack: no exception or record allocation on the happy path beyond the output record. Validation costs ~26% of ELF request throughput on the bench schema.

### Using results under scriptc

`issues` is `VIssue[] | null` and `success` does not narrow it, so narrow `issues` inline (`r.issues === null ? 0 : r.issues.length`, or `if (r.issues !== null)`). Do not copy it to a local first, because scriptc rejects the inferred union (SC2009). A type error anywhere in the program is reported as SC2013 against an npm package even when the package is fine, so run `tsc --noEmit` first to see the real error.

## Validating environment variables

Env vars arrive as strings, half of them missing, and a bad `PORT` should kill the process at boot, not at first request. The pattern: build a spec record of val schemas, `safeParse` it against `process.env` once at startup, print `summarize()` and exit on failure, and hand the coerced record to the app.

```ts
import * as v from "@chttp/val";

function createEnv(spec) {
  // v.object, not strictObject: process.env carries PATH, HOME, ...
  // plain object validates the spec keys and strips the rest
  const r = v.safeParse(v.object(spec), process.env);
  if (r.success) return { ok: true, env: r.output, report: null };
  return { ok: false, env: null, report: v.summarize(r.issues) };
}

const Env = createEnv({
  // string in, number out: transform coerces, minValue checks the result
  PORT: v.pipe(
    v.string(),
    v.transform((s) => Number(s)),
    v.minValue(1),
    v.maxValue(65535),
  ),
  LOG_LEVEL: v.optionalStr(v.pipe(v.string(), v.toLowerCase()), "info"),
  NEW_FEATURE: v.optionalStr(v.union([v.literal("on"), v.literal("off")]), "off"),
});

if (!Env.ok) {
  console.error("invalid environment:\n" + Env.report); // "PORT: min_value"
  process.exit(1);
}
app.serve({ port: Env.env.PORT });
```

`process.env` reads lower fine under scriptc, so the same file runs in Node (`node --experimental-strip-types`) and compiles into the ELF (`scriptc build`). Full runnable template: [`examples/env`](../examples/env/).

## Recommendation

- **Node builds:** any Standard Schema library; validation is not the bottleneck.
- **ELF builds:** `@chttp/val`.
