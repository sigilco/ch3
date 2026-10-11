# Task 04 — Error middleware vs thrown-error path

Two failure shapes, canonical mechanism for each.

## Requirements

- `GET /boom` — handler throws a generic `Error('boom')`. Observed:
  status, body, content-type produced by the framework's default error
  path (recorded verbatim).
- `GET /handled` — handler raises a *framework-native* typed error with
  status 400 (e.g. `HttpError`/`createError`/`next(err)`/early return —
  whichever the framework's docs call canonical) → response must be
  `400` JSON `{ "error": "bad input" }`.
- If the framework supports a custom error hook/middleware, register one
  that renders `500`/`400` errors as JSON `{ "error": "<message>" }`;
  note whether it covers both cases.

## Rules

- One error mechanism per failure shape; no try/catch inside the handler
  if the framework offers an error path (if it doesn't, the try/catch IS
  the honest answer — write it and note it).
- Wrong shape (HTML error page, stack trace leak to client) counts
  against the framework in runtime checks.

## Eval hooks

- Assertions: `GET /handled` must be `400` + JSON `{error}`;
  `GET /boom` records status + whether the body leaks a stack trace
  (heuristic: contains `\n    at `).
