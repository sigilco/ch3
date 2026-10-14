# Roadmap

Quarter-level view. Live task status lives in the
[chttp project](https://github.com/orgs/sigilco/projects/3); this page records
milestones and scheduling, not per-task state.

## 2026-Q4

### M1: Ecosystem expansion (October)

Grow the package family around `@chttp/router` with validation and build-time
adjuncts. Everything here reuses existing seams: the val schema surface and
the unplugin route extraction. The route contract stays frozen.

| Workstream | Effort | Focus |
| --- | --- | --- |
| JSON Schema emission for `@chttp/val` | M | every public schema and pipe action maps to JSON Schema 2020-12; valid OpenAPI 3.1 by construction |
| OpenAPI side-channel emit in `@chttp/unplugin` | M | opt-in `.chttp/routes.openapi.ts` assembled from the extracted route table plus statically locatable val schemas |
| Typed client emit | S/M | `.chttp/routes.client.ts` from the same extraction; types from the build artifact, not chained generics |
| Env validation example | S | recipe on top of `@chttp/val`, not a package |
| Agent skills, middleware cookbook, deploy template | S | docs and copyable templates |

### M2: Credibility (October to November)

- Deploy story promotion: scratch-container images, cold-start and RSS claims
  backed by reproducible artifacts.
- Bench matrix upkeep. The compiled-Hono comparison cell is documented as
  blocked: scriptc 0.3.1 cannot serve Hono (its core dispatch is a fenced
  site); evidence transcripts in `bench/scriptc-evidence/`. Revisit when
  scriptc releases widen coverage.

### M3: Frontend hypothesis (Q4)

Explored in a parallel track: an `html` tagged-template recipe, islands on top
of JSON endpoints, SSG prerender as an unplugin pass. This is a demand probe.
The gate for any framework-scale commitment is evidence from the probe, not
ambition. No M1/M2 package depends on it.
