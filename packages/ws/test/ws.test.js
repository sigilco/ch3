import test from "node:test";
import assert from "node:assert/strict";
import * as http from "node:http";
import * as net from "node:net";
import { createHash } from "node:crypto";
import { createRouter } from "@chttp/router";
import { WsHandler, WsRouter } from "../dist/esm/index.js";
import { clientFrame } from "./helpers.js";

class Rec extends WsHandler {
  constructor() {
    super();
    this.events = [];
  }
  open(c) {
    this.events.push(["open", c.path, c.param("name")]);
    this.conn = c;
  }
  message(c, d) {
    this.events.push(["message", d]);
    c.send("echo:" + d);
  }
  binary(c, d) {
    this.events.push(["binary", d.length]);
    c.sendBinary(d);
  }
  close(_c, code, reason) {
    this.events.push(["close", code, reason]);
  }
}

async function start(h, limits) {
  const ws = new WsRouter().ws("/echo", h).ws("/room/:name", h);
  if (limits) ws.withLimits(limits[0], limits[1]);
  const app = createRouter();
  app.get("/", (c) => c.text("ok"));
  app.withUpgrade(ws);
  // serve() no longer attaches the upgrade listener (router seam change):
  // wire it in the test program, the same way apps must.
  const server = app.serve({ port: 0, host: "127.0.0.1" });
  server.on("upgrade", app.upgradeHandler());
  await new Promise((r) => server.once("listening", r));
  return { server, port: server.address().port };
}

const KEY = "dGhlIHNhbXBsZSBub25jZQ==";
const ACCEPT = "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=";

function rawConnect(port, path, headers) {
  return new Promise((resolve) => {
    const s = net.connect(port, "127.0.0.1");
    let buf = Buffer.alloc(0);
    const out = {
      s,
      get buf() {
        return buf;
      },
      waiters: [],
    };
    s.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      out.waiters = out.waiters.filter((w) => !w());
    });
    s.on("connect", () => {
      const h = headers || {
        Host: "x",
        Upgrade: "websocket",
        Connection: "Upgrade",
        "Sec-WebSocket-Key": KEY,
        "Sec-WebSocket-Version": "13",
      };
      let req = "GET " + path + " HTTP/1.1\r\n";
      for (const k of Object.keys(h)) req += k + ": " + h[k] + "\r\n";
      s.write(req + "\r\n");
      resolve(out);
    });
  });
}

function until(c, pred) {
  return new Promise((resolve) => {
    const check = () => (pred(c.buf) ? (resolve(), true) : false);
    if (!check()) c.waiters.push(check);
  });
}

// Reads the 101 response and returns the remaining bytes as server frames.
function headEnd(buf) {
  const i = buf.indexOf("\r\n\r\n");
  return i < 0 ? -1 : i + 4;
}

async function handshake(port, path) {
  const c = await rawConnect(port, path);
  await until(c, (b) => headEnd(b) > 0);
  c.head = c.buf.subarray(0, headEnd(c.buf)).toString();
  c.frames = () => {
    const out = [];
    let b = c.buf.subarray(headEnd(c.buf));
    while (b.length >= 2) {
      let len = b[1] & 127;
      let off = 2;
      if (len === 126) {
        len = b.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        len = Number(b.readBigUInt64BE(2));
        off = 10;
      }
      if (b.length < off + len) break;
      out.push({ op: b[0] & 15, fin: !!(b[0] & 128), payload: b.subarray(off, off + len) });
      b = b.subarray(off + len);
    }
    return out;
  };
  c.waitFrames = (n) => until(c, () => c.frames().length >= n);
  return c;
}

test("handshake: 101 with the RFC 6455 accept value", async () => {
  const h = new Rec();
  const { server, port } = await start(h);
  const c = await handshake(port, "/echo");
  assert.match(c.head, /^HTTP\/1\.1 101 Switching Protocols\r\n/);
  assert.ok(c.head.includes("Sec-WebSocket-Accept: " + ACCEPT + "\r\n"));
  assert.equal(
    createHash("sha1")
      .update(KEY + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
      .digest("base64"),
    ACCEPT,
  );
  c.s.destroy();
  server.close();
});

test("handshake: unknown path is 404, wrong version/upgrade is 426, no key is 400", async () => {
  const { server, port } = await start(new Rec());
  const base = {
    Host: "x",
    Upgrade: "websocket",
    Connection: "Upgrade",
    "Sec-WebSocket-Key": KEY,
    "Sec-WebSocket-Version": "13",
  };
  const cases = [
    ["/nope", base, "404"],
    ["/echo", { ...base, "Sec-WebSocket-Version": "8" }, "426"],
    ["/echo", { ...base, Upgrade: "h2c" }, "426"],
    [
      "/echo",
      { Host: "x", Upgrade: "websocket", Connection: "Upgrade", "Sec-WebSocket-Version": "13" },
      "400",
    ],
  ];
  for (const [path, h, code] of cases) {
    const c = await rawConnect(port, path, h);
    await until(c, (b) => headEnd(b) > 0);
    assert.ok(
      c.buf.toString().startsWith("HTTP/1.1 " + code),
      path + " -> " + c.buf.toString().split("\r\n")[0],
    );
    c.s.destroy();
  }
  server.close();
});

test("text echo, :param, binary echo, ping/pong, clean close", async () => {
  const h = new Rec();
  const { server, port } = await start(h);
  const c = await handshake(port, "/room/ann?x=1");
  c.s.write(clientFrame(1, Buffer.from("hello")));
  c.s.write(clientFrame(2, Buffer.from([1, 2, 3])));
  c.s.write(clientFrame(9, Buffer.from("pp")));
  await c.waitFrames(3);
  const f = c.frames();
  assert.equal(f[0].payload.toString(), "echo:hello");
  assert.equal(f[1].op, 2);
  assert.deepEqual(f[1].payload, Buffer.from([1, 2, 3]));
  assert.equal(f[2].op, 10);
  assert.equal(f[2].payload.toString(), "pp");
  assert.deepEqual(h.events[0], ["open", "/room/ann", "ann"]);
  c.s.write(clientFrame(8, Buffer.from([0x03, 0xe9, 0x62, 0x79, 0x65])));
  await c.waitFrames(4);
  const cl = c.frames()[3];
  assert.equal(cl.op, 8);
  assert.equal(cl.payload.readUInt16BE(0), 1001);
  await new Promise((r) => c.s.once("close", r));
  assert.deepEqual(h.events.at(-1), ["close", 1001, "bye"]);
  server.close();
});

test("fragmented message with an interleaved ping", async () => {
  const h = new Rec();
  const { server, port } = await start(h);
  const c = await handshake(port, "/echo");
  c.s.write(clientFrame(1, Buffer.from("fra"), { fin: false }));
  c.s.write(clientFrame(9, Buffer.from("!")));
  c.s.write(clientFrame(0, Buffer.from("gm"), { fin: false }));
  c.s.write(clientFrame(0, Buffer.from("ent"), { fin: true }));
  await c.waitFrames(2);
  const f = c.frames();
  assert.equal(f[0].op, 10);
  assert.equal(f[1].payload.toString(), "echo:fragment");
  c.s.destroy();
  server.close();
});

test("a frame split over writes is reassembled", async () => {
  const h = new Rec();
  const { server, port } = await start(h);
  const c = await handshake(port, "/echo");
  const f = clientFrame(1, Buffer.from("slow"));
  c.s.write(f.subarray(0, 3));
  await new Promise((r) => setTimeout(r, 20));
  c.s.write(f.subarray(3));
  await c.waitFrames(1);
  assert.equal(c.frames()[0].payload.toString(), "echo:slow");
  c.s.destroy();
  server.close();
});

test("data glued to the handshake (head) is processed", async () => {
  const h = new Rec();
  const { server, port } = await start(h);
  const s = net.connect(port, "127.0.0.1");
  const req =
    "GET /echo HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: " +
    KEY +
    "\r\nSec-WebSocket-Version: 13\r\n\r\n";
  s.write(Buffer.concat([Buffer.from(req), clientFrame(1, Buffer.from("early"))]));
  let buf = Buffer.alloc(0);
  s.on("data", (d) => (buf = Buffer.concat([buf, d])));
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(buf.toString().includes("echo:early"));
  s.destroy();
  server.close();
});

async function expectClose(port, send, code) {
  const c = await handshake(port, "/echo");
  send(c.s);
  await c.waitFrames(1);
  const f = c.frames()[0];
  assert.equal(f.op, 8);
  assert.equal(f.payload.readUInt16BE(0), code);
  await new Promise((r) => c.s.once("close", r));
}

test("protocol violations close with the right code", async () => {
  const { server, port } = await start(new Rec(), [1000, 1100]);
  await expectClose(
    port,
    (s) => s.write(clientFrame(1, Buffer.from("x"), { masked: false })),
    1002,
  );
  await expectClose(port, (s) => s.write(clientFrame(3, Buffer.alloc(0))), 1002);
  await expectClose(port, (s) => s.write(clientFrame(0, Buffer.from("x"))), 1002);
  await expectClose(
    port,
    (s) => {
      s.write(clientFrame(1, Buffer.from("a"), { fin: false }));
      s.write(clientFrame(1, Buffer.from("b")));
    },
    1002,
  );
  await expectClose(port, (s) => s.write(clientFrame(8, Buffer.from([0x03]))), 1002);
  await expectClose(port, (s) => s.write(clientFrame(8, Buffer.from([0x03, 0xed]))), 1002);
  await expectClose(port, (s) => s.write(clientFrame(1, Buffer.from([0xff, 0xfe]))), 1007);
  await expectClose(port, (s) => s.write(clientFrame(2, Buffer.alloc(1001))), 1009);
  await expectClose(
    port,
    (s) => {
      s.write(clientFrame(1, Buffer.alloc(600), { fin: false }));
      s.write(clientFrame(0, Buffer.alloc(600), { fin: true }));
    },
    1009,
  );
  server.close();
});

test("server close() sends the frame and reports the code to the handler", async () => {
  const h = new Rec();
  const { server, port } = await start(h);
  const c = await handshake(port, "/echo");
  await new Promise((r) => setTimeout(r, 20));
  h.conn.close(1000, "done");
  await c.waitFrames(1);
  const f = c.frames()[0];
  assert.equal(f.op, 8);
  assert.equal(f.payload.readUInt16BE(0), 1000);
  assert.equal(f.payload.subarray(2).toString(), "done");
  c.s.destroy();
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(h.events.at(-1), ["close", 1000, "done"]);
  server.close();
});

test("abrupt disconnect reports 1006 once", async () => {
  const h = new Rec();
  const { server, port } = await start(h);
  const c = await handshake(port, "/echo");
  c.s.destroy();
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(
    h.events.filter((e) => e[0] === "close"),
    [["close", 1006, ""]],
  );
  server.close();
});

test("plain HTTP routes still work with withUpgrade", async () => {
  const { server, port } = await start(new Rec());
  const body = await new Promise((resolve) =>
    http.get({ port, host: "127.0.0.1", path: "/" }, (r) => {
      let s = "";
      r.on("data", (d) => (s += d));
      r.on("end", () => resolve(s));
    }),
  );
  assert.equal(body, "ok");
  server.close();
});

test("handler throws are contained: open, message, binary", async () => {
  class Boom extends WsHandler {
    constructor(what) {
      super();
      this.what = what;
    }
    open(c) {
      if (this.what === "open") throw new Error("boom open");
    }
    message(c, d) {
      if (this.what === "message" && d === "hit") throw new Error("boom message");
      c.send("echo:" + d);
    }
    binary(c, d) {
      if (this.what === "binary") throw new Error("boom binary");
      c.sendBinary(d);
    }
    close() {}
  }
  // open throws -> 1011 close frame, socket dropped, process alive.
  {
    const { server, port } = await start(new Boom("open"));
    const c = await handshake(port, "/echo");
    await c.waitFrames(1);
    assert.equal(c.frames()[0].op, 8);
    assert.equal(c.frames()[0].payload.readUInt16BE(0), 1011);
    await new Promise((r) => c.s.once("close", r));
    server.close();
  }
  // message throws -> 1011, and a fresh connection still round-trips.
  {
    const { server, port } = await start(new Boom("message"));
    const c = await handshake(port, "/echo");
    await new Promise((r) => setTimeout(r, 20));
    c.s.write(clientFrame(1, Buffer.from("hit")));
    await c.waitFrames(1);
    assert.equal(c.frames()[0].op, 8);
    assert.equal(c.frames()[0].payload.readUInt16BE(0), 1011);
    c.s.on("error", () => {});
    await new Promise((r) => c.s.once("close", r));
    const c2 = await handshake(port, "/echo");
    c2.s.write(clientFrame(1, Buffer.from("alive")));
    await c2.waitFrames(1);
    assert.equal(c2.frames()[0].payload.toString(), "echo:alive");
    c2.s.destroy();
    server.close();
  }
  // binary throws -> 1011.
  {
    const { server, port } = await start(new Boom("binary"));
    const c = await handshake(port, "/echo");
    await new Promise((r) => setTimeout(r, 20));
    c.s.write(clientFrame(2, Buffer.from([9])));
    await c.waitFrames(1);
    assert.equal(c.frames()[0].op, 8);
    assert.equal(c.frames()[0].payload.readUInt16BE(0), 1011);
    c.s.on("error", () => {});
    await new Promise((r) => c.s.once("close", r));
    server.close();
  }
});

test("handler close() throw does not crash the process", async () => {
  class BoomClose extends Rec {
    close() {
      throw new Error("boom close");
    }
  }
  const { server, port } = await start(new BoomClose());
  const c = await handshake(port, "/echo");
  c.s.write(clientFrame(8, Buffer.from([0x03, 0xe8])));
  await new Promise((r) => c.s.once("close", r));
  await new Promise((r) => setTimeout(r, 30));
  // The server survived: a follow-up connection completes a full round trip.
  const c2 = await handshake(port, "/echo");
  c2.s.write(clientFrame(1, Buffer.from("still up")));
  await c2.waitFrames(1);
  assert.equal(c2.frames()[0].payload.toString(), "echo:still up");
  c2.s.destroy();
  server.close();
});

test("many fragments reassemble into one intact message", async () => {
  const h = new Rec();
  const { server, port } = await start(h);
  const c = await handshake(port, "/echo");
  const n = 300;
  let expect = "";
  for (let i = 0; i < n; i++) {
    const piece = "p" + (i % 10);
    expect += piece;
    c.s.write(clientFrame(i === 0 ? 1 : 0, Buffer.from(piece), { fin: i === n - 1 }));
  }
  await c.waitFrames(1);
  assert.equal(c.frames()[0].payload.toString(), "echo:" + expect);
  assert.deepEqual(h.events.filter((e) => e[0] === "message"), [["message", expect]]);
  c.s.destroy();
  server.close();
});
