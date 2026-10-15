// stream: Server-Sent Events and chunked text for @chttp/router, authored
// inside the scriptc compilable subset (same bans as packages/router/src).
//
// Helpers are free functions taking a Ctx. They writeHead + flushHeaders and
// set c.sent = true before handing the stream to the callback, so the router
// never answers a 500 for a handler that wrote nothing synchronously, and a
// promise returned by the callback flows into the router's settleChain.
import type { ServerResponse } from "node:http";
import type { Socket } from "node:net";
import type { Ctx } from "@chttp/router/src/index.ts";

// UTF-8 byte length of s (surrogate pairs count 4, lone surrogates 3).
function utf8len(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const cc = s.charCodeAt(i);
    if (cc < 0x80) {
      n += 1;
    } else if (cc < 0x800) {
      n += 2;
    } else if (cc >= 0xd800 && cc <= 0xdbff && i + 1 < s.length) {
      const nx = s.charCodeAt(i + 1);
      if (nx >= 0xdc00 && nx <= 0xdfff) {
        n += 4;
        i++;
      } else {
        n += 3;
      }
    } else {
      n += 3;
    }
  }
  return n;
}

// Drops CR and LF so a field value (event, id) can never inject a new line.
function oneLine(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const cc = s.charCodeAt(i);
    if (cc !== 10 && cc !== 13) {
      out += s.charAt(i);
    }
  }
  return out;
}

// Prefixes every line of s (split on LF, CRLF or CR) with `prefix` and ends
// each with LF. The tail after the last separator is always emitted, so an
// empty s (or one ending in a newline) yields a trailing empty line, as the
// SSE spec's line splitting does.
function prefixLines(prefix: string, s: string): string {
  let out = "";
  let start = 0;
  const n = s.length;
  let i = 0;
  while (i < n) {
    const cc = s.charCodeAt(i);
    if (cc === 10 || cc === 13) {
      out += prefix + s.slice(start, i) + "\n";
      if (cc === 13 && i + 1 < n && s.charCodeAt(i + 1) === 10) {
        i++;
      }
      start = i + 1;
    }
    i++;
  }
  out += prefix + s.slice(start, n) + "\n";
  return out;
}

// Base writer: tracks closed state, abort callbacks and the pending-bytes cap.
//
// scriptc 0.3.1 cannot observe backpressure (write() result, "drain" and
// writableLength are all refused), so the cap is a stand-in: a stream that
// writes more than maxPending bytes inside one windowMs window is treated as
// a slow consumer and closed.
// scriptc>=X: replace the window with the write() result / drain events.
export class ChunkStream {
  res: ServerResponse;
  closed: boolean;
  maxPending: number;
  windowMs: number;
  _pending: number;
  _windowStart: number;
  _abortFns: Array<() => void>;
  _fired: boolean;

  constructor(res: ServerResponse) {
    this.res = res;
    this.closed = false;
    this.maxPending = 1048576;
    this.windowMs = 1000;
    this._pending = 0;
    this._windowStart = Date.now();
    this._abortFns = [];
    this._fired = false;
  }

  // Raw chunk write. Returns false once the stream is closed, including when
  // this very write tripped the pending-bytes cap.
  write(chunk: string): boolean {
    if (this.closed) {
      return false;
    }
    const now = Date.now();
    if (now - this._windowStart >= this.windowMs) {
      this._windowStart = now;
      this._pending = 0;
    }
    this._pending += utf8len(chunk);
    if (this._pending > this.maxPending) {
      this.close();
      return false;
    }
    this.res.write(chunk);
    return true;
  }

  // Ends the response. Abort callbacks run from the "close" event it causes.
  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.res.end();
  }

  // Runs fn once when the connection closes, whether the client left or
  // close() was called. Use it to clear timers and release subscriptions.
  onAbort(fn: () => void): void {
    this._abortFns.push(fn);
    if (this._fired) {
      fn();
    }
  }

  _onClose(): void {
    if (this._fired) {
      return;
    }
    this._fired = true;
    this.closed = true;
    const fns = this._abortFns;
    this._abortFns = [];
    for (let i = 0; i < fns.length; i++) {
      fns[i]();
    }
  }
}

export class SSEStream extends ChunkStream {
  // One event. Multi-line data becomes several data: lines. event and id are
  // optional; CR and LF are stripped from them.
  send(data: string): boolean;
  send(data: string, event: string): boolean;
  send(data: string, event: string, id: string): boolean;
  send(data: string, event?: string, id?: string): boolean {
    let frame = "";
    if (id !== null && id !== undefined) {
      frame += "id: " + oneLine(String(id)) + "\n";
    }
    if (event !== null && event !== undefined) {
      frame += "event: " + oneLine(String(event)) + "\n";
    }
    frame += prefixLines("data: ", String(data)) + "\n";
    return this.write(frame);
  }

  // A comment line (": text"), commonly used as a keep-alive ping.
  comment(text: string): boolean {
    return this.write(prefixLines(": ", String(text)) + "\n");
  }

  // Asks the client to wait ms before reconnecting. Non-numeric and negative
  // values clamp to 0 so the field can never carry garbage.
  retry(ms: number): boolean {
    const v = Math.max(0, Math.floor(Number(ms) || 0));
    return this.write("retry: " + String(v) + "\n\n");
  }
}

export class TextStream extends ChunkStream {
  writeln(s: string): boolean {
    return this.write(String(s) + "\n");
  }
}

function open(c: Ctx, contentType: string, extra: string): ServerResponse {
  // Stream only runs through the Node handler surface (the Fetch surface
  // produces a ReadableStream Response, which is a separate adapter).
  // Direct field access avoids the nullable c.res getter — c._nodeRes is
  // null only on the Fetch path, where streamSSE/streamText are not used.
  const res = c._nodeRes as ServerResponse;
  if (extra === "sse") {
    res.writeHead(res.statusCode, {
      "content-type": contentType,
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
  } else {
    res.writeHead(res.statusCode, {
      "content-type": contentType,
      "cache-control": "no-cache",
      "x-accel-buffering": "no",
    });
  }
  res.flushHeaders();
  c.sent = true;
  return res;
}

// Starts a text/event-stream response and returns fn(stream). A promise
// returned by fn is awaited by the router; a sync return leaves the response
// open until the stream is closed or the client leaves.
// Wires the stream lifecycle to the response. "close" covers the normal end
// of the connection in both directions; the raw socket's "error" covers an
// abrupt failure (reset mid-stream) which would otherwise throw as an
// unhandled EventEmitter error. Both funnel into _onClose, which is
// idempotent. scriptc 0.3.1 whitelists only "close" and "finish" on
// ServerResponse itself, so the error listener goes on the socket (same
// surface packages/ws uses).
function wire(res: ServerResponse, s: ChunkStream): void {
  res.on("close", () => {
    s._onClose();
  });
  const sk: Socket | null = res.socket;
  if (sk !== null) {
    sk.on("error", function (): void {
      s._onClose();
      sk.destroy();
    });
  }
}

export function streamSSE(c: Ctx, fn: (s: SSEStream) => unknown): unknown {
  const res = open(c, "text/event-stream; charset=utf-8", "sse");
  const s = new SSEStream(res);
  wire(res, s);
  return fn(s);
}

// Starts a chunked text/plain response and returns fn(stream).
export function streamText(c: Ctx, fn: (s: TextStream) => unknown): unknown {
  const res = open(c, "text/plain; charset=utf-8", "text");
  const s = new TextStream(res);
  wire(res, s);
  return fn(s);
}
