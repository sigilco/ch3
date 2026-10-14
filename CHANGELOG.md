# Changelog

## Unreleased

<!-- release:start -->
## 0.2.0

The frontend release: WebSockets, SSE and streaming, HTML rendering and static asset serving join the router, each as its own package that stays 100% static under scriptc. The router gains `c.bytes`, and the upgrade listener is no longer attached by `serve()`, so wire `server.on('upgrade', ...)` yourself if you use `@chttp/ws`. `@chttp/unplugin` can now emit an OpenAPI document from `@chttp/val` schemas.

### Features

- **@chttp/html:** Add @chttp/html: subset-native HTML rendering (escapeHtml, h, html tag) and a node-only jsx-runtime
- **@chttp/router:** router: serve() no longer attaches the upgrade listener; wire server.on(upgrade, ...) in your own program (npm-static compilation stays 100% for every app)
- **@chttp/router:** Add c.bytes(buf, contentType) for binary response bodies
- **@chttp/static:** Add @chttp/static: AssetSource, DiskAssets, EmbeddedAssets and serveStatic with ETag/304, HEAD, precompressed siblings, immutable caching and opt-in SPA fallback
- **@chttp/stream:** Add @chttp/stream: streamSSE, SSEStream and streamText for Server-Sent Events and chunked text, with a pending-bytes cap for slow consumers
- **@chttp/unplugin, @chttp/val:** unplugin: OpenAPI side channel emitting .chttp/routes.openapi.ts from proven @chttp/val schemas; val: toJsonSchema/toOpenApiSchema
- **@chttp/ws:** Add @chttp/ws: WebSocket router, RFC 6455 framing, and WsHandler/WsConn on the router upgrade seam

### Fixes

- **@chttp/val:** Fix runtime import of type-only VSafeResult in parse.ts so the source loads as program code
<!-- release:end -->

## 0.1.0

Initial release.

### Features

- **@chttp/router:** minimal async-first HTTP router for `node:http`, zero dependencies, authored in the scriptc compilable subset so the same source compiles to a single native ELF
- **@chttp/val:** schema validation that lowers under scriptc
- **@chttp/unplugin:** build-time route lowering plugin that emits a generated dispatch module
