# val AGENTS.md

`@chttp/val` — minimal Standard Schema library in the scriptc compilable subset. Same subset rules as `packages/router/src` (see root AGENTS.md), plus the constraints discovered while authoring this package:

- **No `unknown`/`any`/`object`/`{[k]: unknown}`/`unknown[]` class fields — ever.** The field type must be concrete (number, string, boolean, concrete arrays/records/unions, program classes). Arbitrary values may only exist as function parameters, return types, local variables, or members of plain records. This is why results are records, `VIssue` has no `input`, and `literal`/`optional` defaults live in typed slots (dkind + s/n/b).
- **No generics on schema classes.** A phantom field `_t: T` instantiates `unknown` and rejects the class; method-return narrowing only works toward subclasses, not primitives. `InferOutput` is a type-level conditional over the concrete classes instead.
- **Method signature overrides must match the base exactly** (parameters identical, returns may only narrow to a subclass).
- **`~standard` must be an inline-initialized class field** (`"~standard": StdProps = new StdProps(this)`); declared-without-initializer computed fields are refused.
- Results/errors flow as `VSafeResult`/`VStdResult` record literals; failure inside `_run` is the module-level `VFail` sentinel, not an exception.
- `scriptc coverage` on `bench/apps/chttp-val.ts` must stay 100% — that file is the package's compile gate.
- `pnpm --filter @chttp/val test` runs the node:test suite against the tsc build; the ELF path is exercised by building `bench/apps/chttp-val.ts` and curling valid/invalid payloads (valid must succeed on repeated requests — the npm-lib failure mode was class poisoning showing up on request 2+).
- scriptc reports ANY program type error as `SC2013 cannot compile npm package '<pkg>' statically`, blaming an npm import even when the package is fine. When a consumer sees it, run `tsc --noEmit` first. `VSafeResult.issues` is `VIssue[] | null` and `success` does not narrow it, so consumers must narrow inline (`r.issues === null ? 0 : r.issues.length`); a local copy fails with SC2009. `pnpm smoke:pack` guards the packed-tarball compile.
