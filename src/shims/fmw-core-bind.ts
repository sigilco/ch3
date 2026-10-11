// src/shims/fmw-core-bind.ts — core acquisition seam for the fmw shim.
//
// MERGE: while `devin/core-v0` is unlanded this points at the test stub.
// When src/index.ts exports the real core, change both lines below to
// `from '../index.ts'` and delete test/stub-fmw.ts. Nothing else in the
// shim touches the core path.
export { createCore } from '../../test/stub-fmw.ts'
export type { Ch3Core, Handler, Next, RouteConstraints, RouteEntry, MatchResult, Context } from '../../test/stub-fmw.ts'
