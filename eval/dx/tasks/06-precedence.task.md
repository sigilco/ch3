# Task 06 — Static + param + wildcard precedence

One path space, three route shapes. Registration order is adversarial:
the wildcard and param routes are registered **before** the static one.

## Requirements

- `GET /assets/*` (wildcard) → `200` `{ "kind": "wild", "path": "<rest>" }`
- `GET /assets/:name` (param) → `200` `{ "kind": "param", "name": "<name>" }`
- `GET /assets/logo.png` (static) → `200` `{ "kind": "static" }`

Register them in the order: wildcard, param, static.

## Expected semantics (recorded, not assumed)

- `GET /assets/logo.png` → static handler
- `GET /assets/x` → param handler
- `GET /assets/a/b` → wildcard handler
- `GET /assets` → recorded verbatim (404 or wildcard-empty, per framework)

## Rules

- Use the framework's native pattern syntax (`*`, `:name`, `{...}` —
  whatever it calls them).
- If the framework's precedence differs from static > param > wild,
  write the registrations so the assertion results reveal it — do not
  reorder to "cheat" the test.

## Eval hooks

- Assertions hit all four paths and compare the winning handler kind.
