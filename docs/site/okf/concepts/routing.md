---
type: concept
title: Routing
source: "https://ch3js.pages.dev/routing/"
path: /routing/
updated: 2026-10-12
okf:
  generated_by: "@docmd/plugin-okf"
  generated_at: "2026-10-12T23:17:15.224Z"
---
# Routing

Routes are registered per method: `app.get | post | put | delete | patch | head | options(path, h)`, plus `app.all(path, h)` for any method and `app.on(method, path, h)` for custom ones.

Paths support static segments, `:param`, and a tail `*` wildcard.

```ts
app.get("/user/:id", (c) => c.req.param("id")); // literal-typed: 'id'
app.get("/wild/*", (c) => c.req.param("*"));
```

## Semantics

- Params are percent-decoded and typed from the path literal (`ParamKey<P>`). Param-less paths degrade `param()` to `string | null`.
- `HEAD` requests fall back to the `GET` handler; node suppresses the body.
- Matched path, unknown method: `405` with an `Allow` header built from the route's method table.
- Unmatched path: `404` (customizable via `app.notFound`).
- Duplicate exact `method`+`path`: first registered wins. Match is strict: no trailing-slash normalization.

## Sub-routers

```ts
const api = createRouter();
api.get("/users", handler);

app.route("/api", api);
```

Parent and sub middleware merge.

Next: [Middleware](middleware.md).
