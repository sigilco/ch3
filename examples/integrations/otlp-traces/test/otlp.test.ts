import assert from "node:assert";
import { createServer } from "node:http";
import test from "node:test";
import { createApp } from "../src/app.ts";
import { newExporter, parseTraceparent } from "../src/otlp.ts";

test("parseTraceparent", () => {
  const tp = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
  assert.deepEqual(parseTraceparent(tp), ["0af7651916cd43dd8448eb211c80319c", "b7ad6b7169203331"]);
  assert.deepEqual(parseTraceparent("garbage"), ["", ""]);
});

test("a batch of spans is POSTed to the collector as OTLP JSON", async () => {
  const received: { url: string; type: string; body: any }[] = [];
  const done = Promise.withResolvers<void>();
  const collector = createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      received.push({ url: req.url as string, type: String(req.headers["content-type"]), body: JSON.parse(raw) });
      res.end("{}");
      done.resolve();
    });
  }).listen(0);
  await new Promise((r) => collector.on("listening", r));
  const cport = (collector.address() as { port: number }).port;

  const app = createApp(newExporter("test-svc", "127.0.0.1", cport, 2));
  const srv = app.serve({ port: 0 });
  await new Promise((r) => srv.on("listening", r));
  const base = "http://127.0.0.1:" + (srv.address() as { port: number }).port;
  const tp = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
  await fetch(base + "/users/7", { headers: { traceparent: tp } });
  await fetch(base + "/boom");
  await done.promise;
  srv.close();
  collector.close();

  assert.equal(received.length, 1);
  assert.equal(received[0].url, "/v1/traces");
  assert.equal(received[0].type, "application/json");
  const rs = received[0].body.resourceSpans[0];
  assert.equal(rs.resource.attributes[0].value.stringValue, "test-svc");
  const spans = rs.scopeSpans[0].spans;
  assert.equal(spans.length, 2);
  assert.equal(spans[0].name, "GET /users/7");
  assert.equal(spans[0].traceId, "0af7651916cd43dd8448eb211c80319c");
  assert.equal(spans[0].parentSpanId, "b7ad6b7169203331");
  assert.match(spans[0].spanId, /^[0-9a-f]{16}$/);
  assert.match(spans[0].startTimeUnixNano, /^\d{19}$/);
  assert.equal(spans[0].status.code, 1);
  assert.equal(spans[1].name, "GET /boom");
  assert.match(spans[1].traceId, /^[0-9a-f]{32}$/);
  assert.equal(spans[1].parentSpanId, "");
  assert.equal(spans[1].status.code, 2);
});
