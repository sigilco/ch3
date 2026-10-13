# Validation

Runtime validation at the edge. In Node mode any [Standard Schema](https://standardschema.dev) library works. npm schema libraries do not compile into a ch3 ELF, so the repo ships `@ch3/val`, a subset-native Standard Schema library.

## TL;DR

| Mode                      | Validation             | Throughput (POST /order, `-c64 -d6` x3, median) |
| ------------------------- | ---------------------- | ----------------------------------------------- |
| Node (`node apps/*.ts`)   | none (read body only)  | ~72k req/s                                      |
| Node                      | `JSON.parse` only      | ~65k req/s                                      |
| Node                      | `@ch3/val` `safeParse` | ~57.9k req/s (same band as valibot)             |
| **ELF**                   | `@ch3/val` `safeParse` | **~73k req/s** (-26% vs unvalidated ELF)        |
| **ELF** (`scriptc build`) | none                   | ~97-104k req/s                                  |

- In Node mode validation costs ~10-18% of request throughput, comparable to what `JSON.parse` itself costs. Pick any Standard Schema library on API taste.
- In ELF mode `@ch3/val` is the way to validate inside the compiled binary.

## `@ch3/val`

`packages/val` is a minimal Standard Schema v1 library written inside the same compilable subset as ch3. `scriptc coverage` on a ch3 app using it: **100% static**.

API mirrors valibot where the subset allows:

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

Shipped surface: `string` `number` `boolean` `any` `unknown` `never` `literal` `picklist` `nullable` `optional(+Str/Num/Bool defaults)` `nullish` `array` `tuple` `object` `looseObject` `strictObject` `record` `union` `custom` `pipe`, actions `minLength` `maxLength` `length` `nonEmpty` `empty` `regex` `email` `uuid` `url` `ipv4` `digits` `startsWith` `endsWith` `includes` `integer` `finite` `safeInteger` `minValue` `maxValue` `gtValue` `ltValue` `multipleOf` `check` `transform` `trim` `trimStart` `trimEnd` `toLowerCase` `toUpperCase` `toMinValue` `toMaxValue`, entry points `parse` `safeParse` `is` `assert` `flatten` `summarize` `VError` `InferOutput`, plus spec-conformant `schema["~standard"]`.

### Deliberate divergences

- Results are plain records (`{ success, output, issues }`), not classes.
- `VIssue` has no `input` member.
- `literal()` and `optional()` defaults accept string/number/boolean/null.
- `optional` with a default is `optionalStr`/`optionalNum`/`optionalBool`.
- `InferOutput` resolves concretely for `string`/`number`/`boolean` schemas; objects/arrays/wrappers resolve to open record types.
- No `Date`/`File`/`Map`/`Set` schemas, no async schemas, no `enum_` object (use `picklist`).

### How it stays fast

Kind-tagged schema classes (same pattern as ch3's `Context`/`ReqView`) with a module-level `VFail` sentinel for failure identity, and a shared push/pop `path` stack: no exception or record allocation on the happy path beyond the output record. Validation costs ~26% of ELF request throughput on the bench schema.

## Recommendation

- **Node builds:** any Standard Schema library; validation is not the bottleneck.
- **ELF builds:** `@ch3/val`.
