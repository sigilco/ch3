# Middleware

Middleware is synchronous: `(c, next) => void`.

```ts
app.use((c, next) => {
  c.header("x-start", Date.now().toString());
  next();
});
```

Middleware applies to routes registered **after** it (snapshot semantics).

## Body

`c.req.body()` is synchronous because dispatch pre-buffers the request body (`data`/`end` concat) for POST/PUT/PATCH/DELETE before invoking the chain. Other methods dispatch immediately.

Next: [Errors](errors.md).
