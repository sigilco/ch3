// @chttp/ws: WebSocket router on top of the @chttp/router upgrade seam
// (docs/upgrade-contract.md). Spec: docs/websocket.md.
//
// Handlers are WsHandler subclasses held in parallel arrays next to their
// path patterns, never a record of functions. Path matching is a small own
// exact + ":param" matcher because the router does not export its trie.
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { UpgradeDispatch } from "@chttp/router";
import {
  OP_BINARY,
  OP_CLOSE,
  OP_CONT,
  OP_PING,
  OP_PONG,
  OP_TEXT,
  P_ERROR,
  P_FRAME,
  WsParser,
  encodeFrame,
  validCloseCode,
} from "./frame.js";

export { WsParser, encodeFrame, validCloseCode } from "./frame.js";

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

// Base class for handlers. Subclass and override what you need.
export class WsHandler {
  open(_c: WsConn): void {}
  message(_c: WsConn, _data: string): void {}
  binary(_c: WsConn, _data: Buffer): void {}
  close(_c: WsConn, _code: number, _reason: string): void {}
}

export class WsConn {
  readonly socket: Socket;
  readonly path: string;
  // Matched ":param" names and values, parallel.
  readonly pnames: string[];
  readonly pvals: string[];
  _h: WsHandler;
  _p: WsParser;
  // 0 open, 1 closed (close frame sent or socket gone).
  _state: number = 0;
  _done: boolean = false;
  // Code reported when the socket closes without a peer close frame.
  _ccode: number = 1006;
  _creason: string = "";
  // Fragmented message in progress.
  _fop: number = 0;
  // Fragments of the open message, joined by one concat at the final frame.
  _fchunks: Buffer[] = [];
  _fbytes: number = 0;
  // Cap on unflushed outbound bytes before a slow consumer is dropped.
  _maxBacklog: number = 4194304;

  constructor(
    socket: Socket,
    path: string,
    pnames: string[],
    pvals: string[],
    h: WsHandler,
    maxPayload: number,
    maxPending: number,
  ) {
    this.socket = socket;
    this.path = path;
    this.pnames = pnames;
    this.pvals = pvals;
    this._h = h;
    this._p = new WsParser(maxPayload, maxPending);
  }

  // Param value by name, or "" when absent.
  param(name: string): string {
    for (let i = 0; i < this.pnames.length; i++) {
      if (this.pnames[i] === name) {
        return this.pvals[i];
      }
    }
    return "";
  }

  isOpen(): boolean {
    return this._state === 0;
  }

  send(text: string): void {
    this._write(OP_TEXT, Buffer.from(text, "utf8"));
  }

  sendBinary(data: Buffer): void {
    this._write(OP_BINARY, data);
  }

  ping(data: Buffer): void {
    if (data.length <= 125) {
      this._write(OP_PING, data);
    }
  }

  // Sends a close frame and half-closes. The handler's close() fires once
  // with this code (or the peer's, if it answers first).
  close(code: number, reason: string): void {
    if (this._state !== 0) {
      return;
    }
    this._sendClose(code, reason);
    this._state = 1;
    this._ccode = code;
    this._creason = reason;
    this.socket.end();
  }

  _write(opcode: number, data: Buffer): void {
    if (this._state !== 0) {
      return;
    }
    if (this.socket.writableLength + data.length > this._maxBacklog) {
      // Slow consumer: the backlog would never flush, so drop it (1008).
      this._state = 1;
      this.socket.destroy();
      this._finish(1008, "");
      return;
    }
    this.socket.write(encodeFrame(opcode, data));
  }

  _sendClose(code: number, reason: string): void {
    const r = Buffer.from(reason, "utf8");
    let n = r.length;
    if (n > 123) {
      n = 123;
    }
    const b = Buffer.alloc(2 + n);
    b[0] = Math.floor(code / 256);
    b[1] = code % 256;
    for (let i = 0; i < n; i++) {
      b[2 + i] = r[i];
    }
    this.socket.write(encodeFrame(OP_CLOSE, b));
  }

  // Fires handler.close exactly once.
  _finish(code: number, reason: string): void {
    if (this._done) {
      return;
    }
    this._done = true;
    this._state = 1;
    // User code: a throw must not take the process down. There is no
    // protocol reply to make here, so just drop the socket.
    try {
      this._h.close(this, code, reason);
    } catch (e) {
      this.socket.destroy();
    }
  }

  _onSocketClose(): void {
    this._finish(this._ccode, this._creason);
  }

  _start(head: Buffer): void {
    const self: WsConn = this;
    // User code: a throw must not take the process down (1011, socket gone).
    try {
      this._h.open(self);
    } catch (e) {
      this._fail(1011);
      this.socket.destroy();
      return;
    }
    if (head.length > 0) {
      this._onData(head);
    }
  }

  _onData(chunk: Buffer): void {
    if (this._state !== 0) {
      return;
    }
    if (!this._p.feed(chunk)) {
      this._fail(1009);
      return;
    }
    while (this._state === 0) {
      const r = this._p.next();
      if (r === P_ERROR) {
        this._fail(this._p.err);
        return;
      }
      if (r !== P_FRAME) {
        return;
      }
      this._frame(this._p.opcode, this._p.fin, this._p.payload);
    }
  }

  _fail(code: number): void {
    if (this._state === 0) {
      this._sendClose(code, "");
      this._state = 1;
      this.socket.end();
    }
    this._finish(code, "");
  }

  _frame(opcode: number, fin: boolean, payload: Buffer): void {
    if (opcode === OP_PING) {
      this._write(OP_PONG, payload);
      return;
    }
    if (opcode === OP_PONG) {
      return;
    }
    if (opcode === OP_CLOSE) {
      this._onClose(payload);
      return;
    }
    if (opcode === OP_CONT) {
      if (this._fop === 0) {
        this._fail(1002);
        return;
      }
    } else if (this._fop !== 0) {
      // New data frame while a fragmented message is open.
      this._fail(1002);
      return;
    }
    if (fin && opcode !== OP_CONT) {
      this._deliver(opcode, payload);
      return;
    }
    if (opcode !== OP_CONT) {
      this._fop = opcode;
    }
    this._fbytes += payload.length;
    if (this._fbytes > this._p.maxPayload) {
      this._fail(1009);
      return;
    }
    this._fchunks.push(payload);
    if (fin) {
      const op = this._fop;
      const whole = Buffer.concat(this._fchunks, this._fbytes);
      this._fop = 0;
      this._fchunks = [];
      this._fbytes = 0;
      this._deliver(op, whole);
    }
  }

  _deliver(opcode: number, data: Buffer): void {
    if (opcode === OP_TEXT) {
      const s = Buffer.from(data).toString("utf8");
      if (!Buffer.from(s, "utf8").equals(data)) {
        this._fail(1007);
        return;
      }
      this._safeMessage(s);
    } else {
      this._safeBinary(data);
    }
  }

  // User code: a throw must not take the process down (1011, socket gone).
  _safeMessage(s: string): void {
    try {
      this._h.message(this, s);
    } catch (e) {
      this._fail(1011);
      this.socket.destroy();
    }
  }

  // User code: a throw must not take the process down (1011, socket gone).
  _safeBinary(data: Buffer): void {
    try {
      this._h.binary(this, data);
    } catch (e) {
      this._fail(1011);
      this.socket.destroy();
    }
  }

  _onClose(payload: Buffer): void {
    let code = 1005;
    let reason = "";
    if (payload.length === 1) {
      this._fail(1002);
      return;
    }
    if (payload.length >= 2) {
      code = payload[0] * 256 + payload[1];
      if (!validCloseCode(code)) {
        this._fail(1002);
        return;
      }
      reason = Buffer.from(payload.subarray(2)).toString("utf8");
    }
    // Echo the code (1000 when the peer sent none) and finish.
    let echo = code;
    if (code === 1005) {
      echo = 1000;
    }
    this._sendClose(echo, "");
    this._state = 1;
    this.socket.end();
    this._finish(code, reason);
  }
}

function matchPattern(pat: string, path: string, names: string[], vals: string[]): boolean {
  const ps = pat.split("/");
  const xs = path.split("/");
  if (ps.length !== xs.length) {
    return false;
  }
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i];
    const b = xs[i];
    if (a.length > 1 && a.charAt(0) === ":") {
      if (b.length === 0) {
        return false;
      }
      names.push(a.slice(1));
      vals.push(b);
    } else if (a !== b) {
      return false;
    }
  }
  return true;
}

function reject(socket: Socket, status: string, extra: string): void {
  socket.write(
    "HTTP/1.1 " + status + "\r\n" + extra + "Connection: close\r\nContent-Length: 0\r\n\r\n",
  );
  socket.end();
}

export class WsRouter extends UpgradeDispatch {
  // Largest accepted message (and single frame) in bytes.
  maxPayload: number = 1048576;
  // Cap on buffered, not yet parsed bytes per connection.
  maxPending: number = 1048576 + 131072;
  // Cap on unflushed outbound bytes per connection.
  maxBacklog: number = 4194304;
  _pats: string[] = [];
  _hs: WsHandler[] = [];

  ws(path: string, h: WsHandler): WsRouter {
    this._pats.push(path);
    this._hs.push(h);
    return this;
  }

  withLimits(maxPayload: number, maxPending: number): WsRouter {
    this.maxPayload = maxPayload;
    this.maxPending = maxPending;
    return this;
  }

  withMaxBacklog(maxBacklog: number): WsRouter {
    this.maxBacklog = maxBacklog;
    return this;
  }

  upgrade(req: IncomingMessage, socket: Socket, head: Buffer): boolean {
    let url = req.url;
    if (url === undefined) {
      url = "/";
    }
    const qi = url.indexOf("?");
    let path = url;
    if (qi >= 0) {
      path = url.slice(0, qi);
    }
    const names: string[] = [];
    const vals: string[] = [];
    let idx = -1;
    for (let i = 0; i < this._pats.length; i++) {
      if (idx < 0) {
        names.length = 0;
        vals.length = 0;
        if (matchPattern(this._pats[i], path, names, vals)) {
          idx = i;
        }
      }
    }
    if (idx < 0) {
      reject(socket, "404 Not Found", "");
      return true;
    }
    const up = req.headers["upgrade"];
    if (up === undefined || up.toLowerCase() !== "websocket") {
      reject(socket, "426 Upgrade Required", "Upgrade: websocket\r\nSec-WebSocket-Version: 13\r\n");
      return true;
    }
    const ver = req.headers["sec-websocket-version"];
    if (ver === undefined || ver !== "13") {
      reject(socket, "426 Upgrade Required", "Sec-WebSocket-Version: 13\r\n");
      return true;
    }
    const key = req.headers["sec-websocket-key"];
    if (req.method !== "GET" || key === undefined || key.length === 0) {
      reject(socket, "400 Bad Request", "");
      return true;
    }
    const accept = createHash("sha1")
      .update(key + WS_GUID)
      .digest("base64");
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " +
        accept +
        "\r\n\r\n",
    );
    const conn = new WsConn(
      socket,
      path,
      names,
      vals,
      this._hs[idx],
      this.maxPayload,
      this.maxPending,
    );
    conn._maxBacklog = this.maxBacklog;
    socket.on("data", function (d: Buffer): void {
      conn._onData(d);
    });
    // http servers allow half-open sockets: a FIN from the peer arrives as
    // "end" and never "close" until we end our side too.
    socket.on("end", function (): void {
      conn._onSocketClose();
      socket.end();
    });
    socket.on("close", function (): void {
      conn._onSocketClose();
    });
    socket.on("error", function (): void {
      socket.destroy();
    });
    conn._start(head);
    return true;
  }
}
