---
type: concept
title: Errors
source: /errors/
path: /errors/
updated: 2026-10-12
okf:
  generated_by: "@docmd/plugin-okf"
  generated_at: "2026-10-12T22:50:52.758Z"
---
# Errors

```ts
app.onError((err, c) => {
  c.status(500).json({ message: err.message });
});
```

An error thrown anywhere in the chain (middleware, handler, response) lands here.

Fallback behavior:

- No `onError` registered, or the handler never responds, or the handler itself throws: built-in `500 Internal Server Error`.
- Headers already sent: socket destroy.

The built-in `405` error carries `.allow` (the `Allow` header value), so custom bodies are easy:

```ts
app.onError((err, c) => {
  if ("allow" in err) {
    c.status(405).header("allow", err.allow).text("method not allowed");
    return;
  }
  c.status(500).text("boom");
});
```
