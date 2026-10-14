// ELF entry (also runs on node): hand-rolled exposition from src/metrics.ts.
import { createApp } from "./app.ts";
import { inc, labels2, newCounter, newHistogram, observe, renderCounter, renderHistogram } from "./metrics.ts";

const requests = newCounter("http_requests_total", "Total HTTP requests");
const duration = newHistogram(
  "http_request_duration_seconds",
  "HTTP request duration in seconds",
  [0.005, 0.01, 0.05, 0.1, 0.5, 1],
);

const app = createApp((method: string, status: number, seconds: number): void => {
  inc(requests, labels2("method", method, "status", "" + status));
  observe(duration, seconds);
});
app.get("/metrics", (c) =>
  c.header("content-type", "text/plain; version=0.0.4; charset=utf-8").text(
    renderCounter(requests) + renderHistogram(duration),
  ),
);
app.serve({ port: 3000 });
