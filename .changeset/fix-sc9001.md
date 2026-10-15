---
"@chttp/router": patch
---

Fix scriptc 0.3.x build fence (SC9001 "live dynFrom of unsupported type httpReq") in `ReqView.header()`. The prior implementation read `this.raw.headersDistinct` through a chained `as unknown as Record<...>` cast on a class-typed field; scriptc 0.3.x cannot lower the indexed field read on the `IncomingMessage` (httpReq) arm of the union and emits SC9001 as an internal compiler error. The fix materializes `raw.headers` and `raw.headersDistinct` into Record-typed locals (`_headers` and `_headersDistinct`) at construction; `header()` reads from these locals, both indexed field reads lower cleanly, and the cost is O(headers) once per request (same as the prior single-value lookups). The same materialization also gives the `app.fetch` Web Standards surface a single shared lookup shape (Web Headers are joined with `, ` per RFC 7230 before `copyHeaders`).

**This is a known fence in the published v0.2.0 and v0.2.1 tarballs** (introduced by the 0.2.8→0.3.x scriptc pin bump in commit `273f209`). Consumers on those versions that try to `scriptc build` their app will hit SC9001 on the chttp router. The next release re-enables the `chttp-scriptc` and `chttp-fast-scriptc` bench cells under 0.3.x and unblocks any downstream `scriptc build` of an app that imports `@chttp/router`. No source change is required on the consumer side beyond bumping the @chttp/router version.

Defense-in-depth: even if a future scriptc release fixes SC9001 directly, the materialization is the right shape (Record locals + O(headers) copy at construction) and stays. The fix is small (~80 LOC net in `packages/router/src/index.ts`) and backports cleanly onto the v0.2.x line if a backport release is needed.

**Partial fix.** This entry fixes two of three known SC9001 sites (`index.ts` `ReqView.header()` `headers` and `headersDistinct` arms). A third site in the `ReqView` constructor's URL read remains open and is tracked in issue #62; it will land in v0.2.3.
