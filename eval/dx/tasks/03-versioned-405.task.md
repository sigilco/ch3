# Task 03 — Versioned routes + 405/`Allow`

Expose two versions of the same resource and behave correctly for wrong
methods.

## Requirements

- `GET /v1/items` → `200` `{ "v": 1, "items": [] }`
- `GET /v2/items` → `200` `{ "v": 2, "items": [] }`
- Use whatever structure the framework considers canonical for grouping
  a version (mounted sub-router, prefix group, or repeated paths — one
  obvious way preferred).
- Wrong-method behavior is measured, not specified: `POST /v1/items` and
  `OPTIONS /v1/items` are issued and the status code, `allow` header, and
  body are recorded verbatim.

## Rules

- Do not hand-code a method-check inside the GET handler; the point is
  what the framework does for you.
- If the framework has a versioning feature, use it; if not, use the
  canonical grouping mechanism and note it.

## Eval hooks

- Assertions record status/headers/body for `POST /v1/items` and
  `OPTIONS /v1/items`; a `405` with a correct `allow` list scores
  against the determinism axis.
