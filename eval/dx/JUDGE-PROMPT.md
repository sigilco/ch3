# Judge prompt — DX eval qualitative axes

Run this AFTER `npx tsx judge.ts` has produced `scorecard.json` and
`RESULTS.md`. Paste the inputs into the prompt verbatim. Write the model's
output to `judge-output/llm-judge-<YYYY-MM-DD>.md` with the run date and
scorecard hash recorded at the top.

---

## Prompt

You are judging authoring DX across four HTTP router subjects: **ch3**
(scriptc-subset, sync-only, `App`/`Ctx`/`ReqView`), **hono** (4.x),
**express** (4.x), **h3** (v1). Score each axis 1–5 per subject (5 = best)
with one line of evidence each. Be adversarial: penalize silent
divergence, multi-path APIs, and error paths a coding agent cannot
predict without docs.

Inputs provided below this prompt:

- `scorecard.json` — script-verified compile/probe/runtime/ways metrics
- probe diagnostics verbatim (trap lines + tsc messages)
- runtime observations for `/boom`, `/double`, `/async`, `POST /v1/items`
- the `WAYS` verification table (verified/partial ways per task)

### Axis A — error-message quality (type-safety)

Using the captured diagnostics and runtime error bodies ONLY:

- When the type checker catches a trap, does the message tell the author
  what to fix (name the valid keys/overloads), or does it dump an
  overload list?
- When the runtime fails (thrown error, wrong method, double-send,
  async-handler rejection), does the client/dev get a diagnosable signal
  or a hang/HTML page/stack leak?
- Score each subject; cite the exact message text you scored.

### Axis B — one obvious way (determinism)

For each task aspect, judge whether the >1-way flags reflect real
authoring ambiguity (two equally-prominent idioms an agent might pick
differently) vs. primary-vs-escape-hatch structure (one clearly canonical
way plus low-level alternatives). Note ch3's `get`/`on`/`all` and hono's
`route`/`basePath`/`mount`/`onError`-vs-early-return explicitly.

### Axis C — implementation variance (determinism)

For each subject: given only the framework's README and the task specs,
predict how much two independent agent implementations would differ
(structure, API choices, file shape). High/medium/low per subject with
justification from the ways table.

### Axis D — concepts learned (ergonomics)

Count the conceptual surface a cold agent must hold: factories, request
objects, response helpers, error types, mounting verbs, middleware shape.
Score 1–5 (5 = smallest coherent surface).

### Output format

```md
# llm-judge <date>
scorecard: <hash or path>
model: <model id used>

## Axis A — error-message quality
| subject | score | evidence |

## Axis B — one obvious way
| subject | score | evidence |

## Axis C — implementation variance
| subject | verdict | justification |

## Axis D — concepts learned
| subject | score | evidence |

## Aggregate qualitative notes
<max 8 bullets of honest findings, incl. where ch3 loses>
```

Honest scoring: ch3 WILL lose rounds — notably param literal typing
(`param(name: string)` is not `ParamKey`-checked in core-v0), no
`queries()` array read, no error hook, no 405/`Allow`, and the
async-handler trap hangs the process. Record losses; do not sandbag.
