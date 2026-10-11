# Task 01 — REST resource CRUD

Author a small JSON CRUD API for a `users` resource using the subject
framework's canonical authoring style (the way its README/examples teach).

## Routes

| Method | Path          | Behavior                                                        |
|--------|---------------|-----------------------------------------------------------------|
| GET    | `/users`      | `200` JSON array of user objects                                 |
| GET    | `/users/:id`  | `200` JSON `{ "id": "<id>" }`; the `:id` value must round-trip   |
| POST   | `/users`      | JSON body `{ "name": string }` → `201` `{ "name": "<name>" }`; missing/invalid `name` → `400` |
| PUT    | `/users/:id`  | JSON body `{ "name": string }` → `200` `{ "id", "name" }`        |
| DELETE | `/users/:id`  | `204` empty                                                      |

## Rules

- `:id` must be read through the framework's typed param mechanism, not by
  re-parsing the URL.
- JSON body access and validation must use the framework's canonical body
  mechanism (no manual `JSON.parse` on the raw socket if the framework
  offers a body API).
- Keep it minimal: in-memory, no persistence, no auth.
- Emit the correct `content-type` for JSON responses through the
  framework's JSON helper, not hand-set headers.

## Eval hooks

- Runtime assertions hit all five routes (see `judge.ts` `TASK_CHECKS['01-crud']`).
- Param literal-typing is probed separately in `probes/` (wrong param name).
- LOC/imports are counted on this file for the ergonomics axis.
