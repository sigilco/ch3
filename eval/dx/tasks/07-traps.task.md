# Task 07 — Agent traps

Deliberate mistakes a coding agent makes when authoring routes. Two
halves:

## A. Runtime traps (this file)

- `GET /async` — a handler declared `async` that returns a JSON body.
  Observed verbatim: response, error, or hang (3s timeout). The ideal is
  *fail loudly* — a clear error beats a silent hang.
- `GET /double` — handler produces a JSON response and then attempts a
  second response write after it. Observed verbatim: which response the
  client sees and whether the server reports an error.

## B. Compile traps (`probes/<subject>/`)

Each probe file contains a marked wrong-code line (`// @dx-expect-error`).
The judge runs `tsc` per file and records whether a diagnostic lands on
the marked line — i.e. whether the type system catches the mistake.

| Probe ID | Mistake |
|---|---|
| `param-name` | `param('nam')` for a `/user/:id` route |
| `param-on-unmatched-route` | reading a param that exists on a *different* route |
| `missing-await` | forgetting `await` on the framework's async API (where applicable) |
| `bad-path` | route path not starting with `/` (string literal) |
| `async-handler` | `async` handler where the framework forbids it |
| `query-not-param` | reading `param()` for a key only present as a query arg |
| `handler-arity` | handler with the wrong signature shape |

## Eval hooks

- Compile traps drive the type-safety axis (caught vs not caught).
- Runtime traps drive determinism (predictable failure vs silent
  divergence) and ergonomics (error-message quality, LLM-judged).
