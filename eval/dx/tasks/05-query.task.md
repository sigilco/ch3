# Task 05 — Query parsing: arrays + defaults + numbers

`GET /search` parses a query string into a typed result.

## Requirements

- `tag` — repeatable key. `?tag=a&tag=b` must yield **all** values
  `["a","b"]`. A single `?tag=a` yields `["a"]`. Absent → `[]`.
- `limit` — integer, default `20`, must be returned as a JSON **number**.
- `offset` — integer, default `0`, JSON number.
- `q` — optional string, default `null`/absent → echoed back when
  present.

Response: `200` `{ "tags": [...], "limit": <n>, "offset": <n>, "q": <string|null> }`.

## Rules

- Use the framework's query API for repeated keys if it has one; if the
  framework collapses repeated keys, implement the honest workaround and
  note it (raw URL re-parse, custom helper, etc).
- Numeric conversion must be explicit and safe (`Number(...)`, NaN →
  default).

## Eval hooks

- Assertions hit `?tag=a&tag=b&limit=5`, `?tag=a`, and bare `/search`.
- This task measures API completeness for a canonical case; workarounds
  count against ergonomics (LOC) and determinism (extra hand-rolled
  code paths).
