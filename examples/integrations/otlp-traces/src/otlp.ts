import { request } from "node:http";

// Subset-native OTLP/HTTP JSON trace exporter. Plain records, no classes, no
// Map. Spec: https://opentelemetry.io/docs/specs/otlp/#otlphttp

export interface Span {
  traceId: string; // 32 hex chars
  spanId: string; // 16 hex chars
  parentSpanId: string; // "" for a root span
  name: string;
  startMs: number;
  endMs: number;
  httpStatus: number;
}

export interface Exporter {
  host: string;
  port: number;
  path: string;
  service: string;
  batchSize: number;
  pending: Span[];
}

export function newExporter(service: string, host: string, port: number, batchSize: number): Exporter {
  return { host: host, port: port, path: "/v1/traces", service: service, batchSize: batchSize, pending: [] };
}

const HEX = "0123456789abcdef";

export function randomHex(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += HEX.charAt(Math.floor(Math.random() * 16));
  }
  return out;
}

// W3C traceparent: 00-<32 hex trace id>-<16 hex parent id>-<2 hex flags>.
// Returns [traceId, parentSpanId], or ["", ""] when absent or malformed.
export function parseTraceparent(h: string): string[] {
  if (h.length !== 55 || h.charAt(2) !== "-" || h.charAt(35) !== "-" || h.charAt(52) !== "-") {
    return ["", ""];
  }
  return [h.substring(3, 35), h.substring(36, 52)];
}

// OTLP wants nanosecond timestamps as strings (they exceed 2^53 as numbers).
function nanos(ms: number): string {
  return "" + ms + "000000";
}

export function payload(e: Exporter, spans: Span[]): string {
  const out: unknown[] = [];
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i];
    const span = {
      traceId: s.traceId,
      spanId: s.spanId,
      parentSpanId: s.parentSpanId,
      name: s.name,
      kind: 2, // SPAN_KIND_SERVER
      startTimeUnixNano: nanos(s.startMs),
      endTimeUnixNano: nanos(s.endMs),
      attributes: [{ key: "http.response.status_code", value: { intValue: "" + s.httpStatus } }],
      status: { code: s.httpStatus >= 500 ? 2 : 1 },
    };
    out.push(span);
  }
  return JSON.stringify({
    resourceSpans: [
      {
        resource: { attributes: [{ key: "service.name", value: { stringValue: e.service } }] },
        scopeSpans: [{ scope: { name: "chttp-example-otlp-traces" }, spans: out }],
      },
    ],
  });
}

// Fire and forget POST. Export failures never break the request path.
export function flush(e: Exporter): void {
  if (e.pending.length === 0) return;
  const body = payload(e, e.pending);
  e.pending = [];
  const req = request(
    {
      host: e.host,
      port: e.port,
      path: e.path,
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "" + Buffer.byteLength(body) },
    },
    (res) => {
      res.resume();
    },
  );
  req.on("error", (_err: unknown): void => {
    console.log("otlp export failed");
  });
  req.end(body);
}

export function record(e: Exporter, s: Span): void {
  e.pending.push(s);
  if (e.pending.length >= e.batchSize) flush(e);
}
