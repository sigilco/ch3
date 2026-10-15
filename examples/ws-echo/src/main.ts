import { createServer } from "node:http";
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { createRouter } from "../.vendor/router/index.ts";
import { WsConn, WsHandler, WsRouter } from "../.vendor/ws/index.ts";

class Echo extends WsHandler {
  open(c: WsConn): void {
    c.send("welcome");
  }
  message(c: WsConn, data: string): void {
    c.send(data);
  }
  binary(c: WsConn, data: Buffer): void {
    c.sendBinary(data);
  }
}

class Room extends WsHandler {
  open(c: WsConn): void {
    c.send("joined " + c.param("name"));
  }
  message(c: WsConn, data: string): void {
    c.send(c.param("name") + ": " + data);
  }
}

// Outbound FFI: signature-only declaration bound to ffi_fnv1a in
// ffi_native.c via .vendor/ffi.json (`scriptc build --ffi`). The `next`
// callback is call-scoped — native code pulls each byte while the call
// runs; captures still work (scriptc installs it in a TLS slot).
declare function ffiFnv1a(next: () => number, len: number, seed: number): number;

const app = createRouter();
app.get("/", (c) => c.text("ws-echo: connect to /echo or /room/:name"));
app.get("/ffi/:text", (c) => {
  const text = c.req.param("text");
  if (text === null) {
    return c.text("missing :text");
  }
  const bytes = Buffer.from(text, "utf8");
  let i = 0;
  const h = ffiFnv1a(
    () => {
      const b = bytes[i];
      i = i + 1;
      return b;
    },
    bytes.length,
    2166136261,
  );
  return c.text("0x" + (h >>> 0).toString(16).padStart(8, "0"));
});
const ws = new WsRouter().ws("/echo", new Echo()).ws("/room/:name", new Room());

// An annotated literal listener is the form scriptc lowers for "upgrade"
// (a listener value built elsewhere is rejected), so wire it here instead
// of through app.serve(): attach it here (see docs/websocket.md).
const server = createServer(app.handler());
server.on("upgrade", function (req: IncomingMessage, socket: Socket, head: Buffer): void {
  if (!ws.upgrade(req, socket, head)) {
    socket.destroy();
  }
});
server.listen(Number(process.argv[2] || 3000));
