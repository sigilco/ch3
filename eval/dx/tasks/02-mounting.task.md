# Task 02 — Route mounting + prefix middleware

Compose two routers: a public root surface and a mounted `/api` surface
with middleware that applies **only** under `/api`.

## Requirements

- A sub-router/module `api` mounted at `/api` containing:
  - `GET /api/data` → `200` `{ "data": "secret" }`
  - `GET /api/more` → `200` `{ "data": "more" }`
- A guard middleware scoped to `/api` only: when the request has no
  `token` query param → `401` `{ "error": "unauthorized" }`; otherwise it
  calls the next handler and sets response header `x-guard: api`.
- Root surface: `GET /health` → `200` `{ "ok": true }` — must NOT pass
  through the guard.

## Rules

- The guard must be expressed through the framework's middleware/mount
  mechanism, not re-implemented inside each `/api` handler.
- Mounting must use the framework's router-mount API (no manual
  prefix-stripping in a catch-all).

## Eval hooks

- Assertions: `GET /health` → 200; `GET /api/data` → 401;
  `GET /api/data?token=x` → 200 + `x-guard: api`; `GET /api/more?token=x` → 200;
  `GET /health` must not carry `x-guard`.
