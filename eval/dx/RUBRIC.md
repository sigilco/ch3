# DX eval rubric

Owner's rubric, weights in this order (law):

1. **Type-safety** — heaviest. Does wrong code fail at typecheck?
2. **Determinism** — is there ONE obvious way per task? Low implementation
   variance across equivalent attempts.
3. **Ergonomics** — LOC, imports needed, concepts learned, error-message
   quality.

Concrete weights: **type-safety 0.50, determinism 0.30, ergonomics 0.20**.

## What is measured (script-verified, `judge.ts`)

| Signal | Where it comes from | Axis |
|---|---|---|
| `compileRate` | `tsc --noEmit` per `subjects/<s>/<task>.ts` | type-safety (30%) |
| `probeRate` | `// @dx-expect-error[<id>]` lines in `probes/<s>/` — fraction where a diagnostic lands on the marked line | type-safety (70%) |
| `conformRate` | live-server assertions in `TASK_CHECKS` — status codes, bodies, `allow`, `x-guard`, stack-trace leaks, hang detection, `unhandledRejection` escapes | determinism (50%) |
| `singleWayRate` | tasks where exactly ONE verified public API expresses the headline pattern (`WAYS` table; members verified on the type surface via the TS checker, exports verified at runtime, `syntax` candidates documented) | determinism (50%) |
| `loc` | non-blank non-comment lines per task file | ergonomics (50%) |
| `imports` | imported names per task file | ergonomics (50%) |

`partial: true` way candidates exist but cannot express the pattern (e.g.
`c.req.query` cannot read repeated keys) — listed as _(partial)_, never
counted. A task with zero verified ways scores **no native way**.

## What is LLM-judged (`JUDGE-PROMPT.md` → `judge-output/`)

- **Error-message quality** — the captured diagnostics verbatim (in
  `scorecard.json` probe results) are scored 1–5 for actionability.
- **One-obvious-way judgement** — beyond the mechanical count: are the
  competing ways genuinely equivalent or clearly primary/escape-hatch?
- **Implementation variance** — how much would two cold agent attempts at
  the same task differ in structure.
- **Concepts learned** — surface-area burden per subject.

LLM scores are committed under `judge-output/` with the prompt version
and the input data hash/reference so re-runs stay auditable. The numeric
scorecard NEVER depends on LLM judgement — those axes annotate
`RESULTS.md` only.

## Subject versions (this run)

- ch3: `devin/core-v0` API (`App`/`Ctx`/`ReqView`) — in-repo `src/index.ts`
- hono 4.13 + `@hono/node-server` 1.19
- express 4.22 + `@types/express` 4.17
- h3 1.15 (v1 API)

## Scoring notes

- Probe totals differ per subject: `missing-await` applies only where the
  framework has an async-shaped API (ch3, express excluded); `async-handler`
  applies only where async handlers are forbidden (ch3). Absent probes are
  n/a, not failures.
- `conformRate` counts only checks with expectations; recorded-only
  observations (OPTIONS behavior, `/boom` body, `/double`) are verbatim in
  RESULTS.md for the LLM judge.
- Express 4.x params are literal-typed by `@types/express` path inference;
  this is real and scored accordingly.
