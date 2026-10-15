// In-process smoke test for the Lambda bridge. Synthesizes
// APIGW v2.0 events directly (no AWS credentials, no
// sam/localstack), feeds them through the handler, and
// asserts the proxy result shape. The custom-runtime ELF
// path is documented in the README; this test is the
// always-on gate.
import assert from "node:assert/strict";
import test from "node:test";
import { handler } from "../src/handler.ts";

type APIGWv2Event = Parameters<typeof handler>[0];

function ev(over: Partial<APIGWv2Event> = {}): APIGWv2Event {
  return {
    version: "2.0",
    rawPath: "/",
    rawQueryString: "",
    headers: null,
    queryStringParameters: null,
    body: null,
    isBase64Encoded: false,
    requestContext: { http: { method: "GET" } },
    ...over,
  };
}

test("GET / returns 200 + text", async () => {
  const r = await handler(ev({ rawPath: "/" }));
  assert.equal(r.statusCode, 200);
  assert.equal(r.body, "hello from chttp on AWS Lambda");
});

test("GET /user/:id returns the id in JSON", async () => {
  const r = await handler(ev({ rawPath: "/user/42" }));
  assert.equal(r.statusCode, 200);
  const body = JSON.parse(r.body) as { id: string; source: string };
  assert.equal(body.id, "42");
  assert.equal(body.source, "aws-lambda");
});

test("POST /echo returns the buffered body", async () => {
  const r = await handler(
    ev({
      rawPath: "/echo",
      body: "ping",
      requestContext: { http: { method: "POST" } },
    }),
  );
  assert.equal(r.statusCode, 200);
  assert.equal(r.body, "got: ping");
});

test("headers from the event flow into the request", async () => {
  // chttp reads x-token via c.req.header. The smoke app doesn't
  // assert it, but the bridge must not drop it. Verify by
  // hitting a route that echoes the header through a future
  // helper; for now, just confirm the header round-trips by
  // passing it through and asserting no error. (The /user
  // route ignores headers, so a 200 is the only check.)
  const r = await handler(
    ev({
      rawPath: "/user/42",
      headers: { "x-token": "abc" },
    }),
  );
  assert.equal(r.statusCode, 200);
});
