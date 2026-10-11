# eval/dx — DX evaluation harness

Repeatable, agent-runnable suite measuring authoring ergonomics,
type-safety, and determinism for **ch3** vs **hono** vs **express** vs
**h3**. Not a benchmark — an eval.

## Layout

- `tasks/*.task.md` — canonical authoring scenarios, written so an agent
  can implement them cold.
- `subjects/<subject>/<task>.ts` — canonical implementations; each
  default-exports a `node:http` listener.
- `probes/<subject>/traps.probe.ts` — wrong code with
  `// @dx-expect-error[<trap-id>]` markers; the judge checks whether tsc
  catches each marked line.
- `surface/<subject>.surface.ts` — typed objects the judge walks to
  verify public API members (and count overloads).
- `judge.ts` — runs tsc probes, live-server assertions, LOC/import
  counts, single-way verification; emits `scorecard.json` + `RESULTS.md`.
- `RUBRIC.md` — the owner's rubric and scoring formulas.
- `RESULTS.md` — generated scorecard (current run committed).
- `JUDGE-PROMPT.md` + `judge-output/` — LLM-judged axes (error-message
  quality, one-obvious-way, variance, concepts) as prompt template +
  captured output.

## Run

```sh
cd eval/dx
npm install
npx tsx judge.ts        # writes scorecard.json + RESULTS.md
```

Requires node >= 18. ch3 resolves to the in-repo `src/index.ts` via
tsconfig `paths` — no package build needed.

## Re-running the LLM judge

Execute `JUDGE-PROMPT.md` against the fresh `scorecard.json`/`RESULTS.md`
and write the output to `judge-output/llm-judge-<date>.md`, recording the
scorecard hash at the top.
