# aws-lambda

chttp on AWS Lambda via the `app.fetch` Web Standards surface.

The bridge in `src/handler.ts` is the entire integration: it converts an API Gateway v2.0 (or Lambda URL) proxy event into a `Request`, hands it to `app.fetch`, and serializes the `Response` back into the v2.0 result format. The same source runs on two runtimes:

| Runtime | Build | Invocation |
| --- | --- | --- |
| `provided.al2023` | `scriptc build` → static ELF replaces `bootstrap` | Lambda custom runtime reads the event JSON on stdin, writes the result JSON to stdout |
| `nodejs20.x` (or later) | `tsc` (or `node --experimental-strip-types`) | Standard Lambda handler invocation; the export `handler(event)` is the entry |

The bridge is 60 LOC; the rest of the recipe is the `createRouter()` you'd write for a `node:http` deployment.

## APIGW v2.0 payload format

The bridge targets the v2.0 event format (`{ version: "2.0", rawPath, rawQueryString, headers, body, isBase64Encoded, requestContext: { http: { method } } }`). This is the format produced by:

- API Gateway HTTP API
- API Gateway REST API with the v2 payload mapping
- Lambda URL

The result format is also v2.0. **Multi-value response headers (e.g. multiple `Set-Cookie`) are not supported on v2.0** — the format collapses to single-value pairs. If you need `Set-Cookie` in Lambda responses, switch to the v1.0 payload or use the ALB multi-value variant. The bridge is a drop-in candidate for v1.0; today's example sticks to v2.0 because it covers the most common shape (HTTP API + Lambda URL).

## Build: ELF (`provided.al2023`)

```sh
pnpm --filter @chttp/router build                              # once
pnpm --filter chttp-example-aws-lambda build:elf
# produces ./bootstrap — a static ELF
```

The zip is the standard custom-runtime shape:

```sh
zip -j lambda.zip bootstrap
# upload via `aws lambda create-function --runtime provided.al2023 --handler bootstrap`
```

The ELF runs without Node.js installed in the runtime environment; chttp's `app.fetch` lowers to a fully static binary that owns the APIGW event loop. `scriptc build` validates the subset during compilation — a regression shows up as a `SCxxxx` diagnostic, not a runtime crash on cold start.

The `scriptc build` step requires the scriptc LLVM codegen binary to be executable on the build machine. On Linux CI runners this is set up by the install hook; on macOS the codegen may need `chmod +x` on `node_modules/.pnpm/@scriptc+cli-darwin-arm64@0.3.x/.../bin/scriptc-llvm-codegen` before the first build. The in-process smoke test (next section) does not depend on the codegen — it runs the same handler through Node, so the recipe is testable everywhere.

## Run: Node

```sh
pnpm --filter chttp-example-aws-lambda test          # in-process smoke
pnpm --filter chttp-example-aws-lambda start:node    # reads event JSON from stdin
```

The `start:node` script invokes the custom-runtime `bootstrap()` path. Pipe a sample event in:

```sh
echo '{"version":"2.0","rawPath":"/user/42","rawQueryString":"","headers":null,"queryStringParameters":null,"body":null,"isBase64Encoded":false,"requestContext":{"http":{"method":"GET"}}}' | pnpm start:node
```

A node-based Lambda function would expose `export const handler = handler` (or rename) and let the platform invoke it through the standard Node runtime. The bridge is identical; only the surrounding harness changes.

## In-process smoke

`test/smoke.test.ts` synthesizes three APIGW v2.0 events (GET `/`, GET `/user/:id`, POST `/echo`) and feeds them through the bridge. No AWS credentials, no `sam`, no `localstack`. It runs in CI as the always-on gate.

## What this recipe does NOT do

- **No multi-value response headers.** v2.0 doesn't support them. The bridge will collapse multiple `Set-Cookie` values into a single comma-joined header (against spec; cookie values can contain commas). For Set-Cookie, use v1.0 or the ALB target.
- **No binary request bodies.** v2.0 + base64 is supported (`isBase64Encoded: true`); the bridge passes through to `Request.arrayBuffer()`. There's no example test for it — add one if you need it.
- **No Lambda Extensions / Telemetry API.** The bridge doesn't subscribe to `INVOKE` or `SHUTDOWN` events. If you need them, register handlers before calling `app.fetch`.
- **No Lambda@Edge.** `provided.al2023` isn't supported on Edge; that's a separate (blocked) follow-up.
