# Architecture

chttp is authored inside the **scriptc compilable subset**: the whole package lowers statically into a native ELF via `scriptc build --npm-static @chttp/router` with zero deferred sites (100% static coverage on scriptc 0.3.1).

The full document lives in the repo: [ARCHITECTURE.md](https://github.com/sigilco/chttp/blob/main/ARCHITECTURE.md).

Highlights of the subset rules the source obeys:

- `| null` unions only
- Plain records for route data (no function values inside records: handlers live in `App._fns`, nodes carry indices)
- Indexed loops, no recursion for matching (explicit frame stack)
- No `slice`/`concat`/spread on package paths
- Statement-called `res.end()`

One file, `src/index.ts`, holds the whole core: router, context, node adapter.

The generated-dispatch seam (`src/gen.ts`, frozen contract) allows build-time route lowering: [route-contract.md](route-contract.md).
