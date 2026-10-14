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

const app = createRouter();
app.get("/", (c) => c.text("ws-echo: connect to /echo or /room/:name"));
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
