# @chttp/unplugin

## 0.3.0

### Minor Changes

- Multipart uploads: per-route multipart option parses the stream at dispatch (memoryStorage/diskStorage, streaming maxFileBytes/maxFiles/maxFieldBytes -> 413), c.req.file/field/files/fields; unplugin declines declared-multipart routes (contract v3).

### Patch Changes

- Updated dependencies:
  - @chttp/router@0.3.0
  - @chttp/val@0.3.0

## 0.2.1

## 0.2.0

### Minor Changes

- unplugin: OpenAPI side channel emitting .chttp/routes.openapi.ts from proven @chttp/val schemas; val: toJsonSchema/toOpenApiSchema

### Patch Changes

- Updated dependencies:
  - @chttp/router@0.2.0
  - @chttp/val@0.2.0
