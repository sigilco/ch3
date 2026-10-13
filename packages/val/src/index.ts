// val — a minimal Standard Schema validation library authored inside the
// scriptc-compilable subset, so it compiles to a native ELF alongside ch3
// (npm validation libraries cannot: importing one poisons program-code class
// instantiation under scriptc 0.3.0 — see docs/validation.md).
//
// API shape mirrors valibot where the subset allows it (~70-80% of the
// surface REST apps use). Structural constraints discovered under scriptc:
//   - Class fields can ONLY be concretely typed: no unknown/any/object/
//     record-of-unknown/array-of-unknown fields. Everything arbitrary
//     flows through function parameters/returns and plain records.
//   - Results are plain records (VSafeResult / VStdResult), not classes.
//   - VIssue carries type/expected/received/message/path — no `input`
//     (it is a valibot extension, not part of the Standard Schema spec;
//     an `unknown` field cannot compile).
//   - `literal()` and `optional()` defaults support string/number/boolean/
//     null only (values live in typed slots).
//   - No `| undefined` unions (undefined members simply can't compile);
//     optional fields use `| null`.
//   - No Date/File/Blob/Map/Set schemas, no async schemas, no function
//     values inside records — checks/transforms live on class instances.
//
// Subset notes (same rules as packages/ch3): `| null` unions only; indexed
// for loops + for..of over arrays; `instanceof` only on classes declared in
// program code; `as` casts at entry points for `unknown` params.
//
// Layout: types.ts (VIssue, results, FAIL sentinel, issue helpers),
// schemas.ts (schema classes + InferOutput), actions.ts (pipe actions),
// parse.ts (entry points + reporting), factories.ts (public constructors).
// This file re-exports the public surface; nothing else lives here.

import type { VSafeResult, VStdResult } from "./types.ts";
import { StdProps, VIssue, VSchema } from "./types.ts";
import type { InferOutput } from "./schemas.ts";
import { VError } from "./parse.ts";
import { assert, flatten, is, parse, safeParse, summarize } from "./parse.ts";
import type { VFlatIssues } from "./parse.ts";

export { StdProps };
export { VIssue };
export { VSchema };
export type { VSafeResult };
export type { VStdResult };
export type { InferOutput };
export { VError };
export { safeParse };
export { parse };
export { is };
export { assert };
export { flatten };
export { summarize };
export type { VFlatIssues };

export {
  any,
  array,
  boolean,
  check,
  custom,
  digits,
  email,
  empty,
  endsWith,
  finite,
  gtValue,
  includes,
  integer,
  ipv4,
  length,
  literal,
  looseObject,
  ltValue,
  maxLength,
  maxValue,
  minLength,
  minValue,
  multipleOf,
  never,
  nonEmpty,
  nullable,
  nullish,
  number,
  object,
  optional,
  optionalBool,
  optionalNum,
  optionalStr,
  picklist,
  pipe,
  record,
  regex,
  safeInteger,
  startsWith,
  strictObject,
  string,
  toLowerCase,
  toMaxValue,
  toMinValue,
  toUpperCase,
  transform,
  trim,
  trimEnd,
  trimStart,
  tuple,
  union,
  unknown,
  url,
  uuid,
} from "./factories.ts";
