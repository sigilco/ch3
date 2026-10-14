// Node-only entry: prom-client (its Grouper extends Map, which scriptc rejects).
import { Counter, Histogram, Registry } from "prom-client";
import { createApp } from "./app.ts";

const registry = new Registry();
const requests = new Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "status"],
  registers: [registry],
});
const duration = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [registry],
});

const app = createApp((method: string, status: number, seconds: number): void => {
  requests.inc({ method: method, status: String(status) });
  duration.observe(seconds);
});
// prom-client renders asynchronously; chttp handlers may return a Promise.
app.get("/metrics", async (c) =>
  c.header("content-type", registry.contentType).text(await registry.metrics()),
);
app.serve({ port: 3000 });
