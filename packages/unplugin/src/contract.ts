// Route-contract version shared with the runtime check.
//
// ROUTE_CONTRACT_VERSION must equal ch3's exported ROUTE_CONTRACT_VERSION
// (packages/ch3/src/gen.ts, re-exported from src/index.ts); the equality
// test asserts it against the real workspace ch3 export. Bump both
// together on any contract change (docs/route-contract.md, Contract
// versioning) — never let them drift.

export const ROUTE_CONTRACT_VERSION = 1;
