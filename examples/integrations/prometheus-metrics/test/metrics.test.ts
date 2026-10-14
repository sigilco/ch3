import assert from "node:assert";
import test from "node:test";
import { createApp } from "../src/app.ts";
import {
  escapeLabel, inc, labels2, newCounter, newHistogram, observe, renderCounter, renderHistogram,
} from "../src/metrics.ts";

test("counter renders HELP, TYPE and labelled samples", () => {
  const c = newCounter("reqs_total", "Requests");
  inc(c, labels2("method", "GET", "status", "200"));
  inc(c, labels2("method", "GET", "status", "200"));
  inc(c, labels2("method", "POST", "status", "400"));
  assert.equal(
    renderCounter(c),
    "# HELP reqs_total Requests\n# TYPE reqs_total counter\n" +
      'reqs_total{method="GET",status="200"} 2\nreqs_total{method="POST",status="400"} 1\n',
  );
});

test("histogram buckets are cumulative and end with +Inf, sum, count", () => {
  const h = newHistogram("lat", "Latency", [0.1, 1]);
  observe(h, 0.05);
  observe(h, 0.5);
  observe(h, 5);
  assert.equal(
    renderHistogram(h),
    "# HELP lat Latency\n# TYPE lat histogram\n" +
      'lat_bucket{le="0.1"} 1\nlat_bucket{le="1"} 2\nlat_bucket{le="+Inf"} 3\n' +
      "lat_sum 5.55\nlat_count 3\n",
  );
});

test("label values are escaped", () => {
  assert.equal(escapeLabel('a"b\\c\nd'), 'a\\"b\\\\c\\nd');
});

test("middleware records requests that /metrics then exposes", async () => {
  const c = newCounter("http_requests_total", "Total");
  const app = createApp((method, status) => inc(c, labels2("method", method, "status", "" + status)));
  app.get("/metrics", (ctx) => ctx.text(renderCounter(c)));
  const srv = app.serve({ port: 0 });
  await new Promise((r) => srv.on("listening", r));
  const base = "http://127.0.0.1:" + (srv.address() as { port: number }).port;
  await fetch(base + "/users/1");
  await fetch(base + "/boom");
  const body = await (await fetch(base + "/metrics")).text();
  srv.close();
  assert.match(body, /http_requests_total\{method="GET",status="200"\} 1/);
  assert.match(body, /http_requests_total\{method="GET",status="500"\} 1/);
});
