import test from "node:test";
import assert from "node:assert/strict";
import * as http from "node:http";
import * as net from "node:net";
import { createRouter, UpgradeDispatch } from "../dist/esm/index.js";

function mkSocket() {
  return {
    destroyed: false,
    destroy() {
      this.destroyed = true;
    },
  };
}

class Recorder extends UpgradeDispatch {
  constructor(ret) {
    super();
    this.ret = ret;
    this.calls = [];
  }
  upgrade(req, socket, head) {
    this.calls.push({ req, socket, head });
    return this.ret;
  }
}

test("UpgradeDispatch default returns false", () => {
  assert.equal(new UpgradeDispatch().upgrade({}, mkSocket(), Buffer.alloc(0)), false);
});

test("upgradeHandler: handled upgrade keeps the socket", () => {
  const u = new Recorder(true);
  const app = createRouter().withUpgrade(u);
  const sock = mkSocket();
  const head = Buffer.from("h");
  const req = { url: "/ws" };
  app.upgradeHandler()(req, sock, head);
  assert.equal(u.calls.length, 1);
  assert.equal(u.calls[0].req, req);
  assert.equal(u.calls[0].head, head);
  assert.equal(sock.destroyed, false);
});

test("upgradeHandler: unhandled upgrade destroys the socket", () => {
  const app = createRouter().withUpgrade(new Recorder(false));
  const sock = mkSocket();
  app.upgradeHandler()({ url: "/x" }, sock, Buffer.alloc(0));
  assert.equal(sock.destroyed, true);
});

test("upgradeHandler: nothing registered destroys the socket", () => {
  const sock = mkSocket();
  createRouter().upgradeHandler()({ url: "/x" }, sock, Buffer.alloc(0));
  assert.equal(sock.destroyed, true);
});

test("withUpgrade: last registration wins", () => {
  const a = new Recorder(true);
  const b = new Recorder(true);
  const app = createRouter().withUpgrade(a).withUpgrade(b);
  app.upgradeHandler()({ url: "/" }, mkSocket(), Buffer.alloc(0));
  assert.equal(a.calls.length, 0);
  assert.equal(b.calls.length, 1);
});

test("serve(): never attaches an upgrade listener (wire it yourself)", async () => {
  // serve() must stay attach-free: any "upgrade" attach built inside the
  // package defers 2 SC1090 sites under scriptc npm-static compilation,
  // for every app importing the router. Upgrade users wire the listener
  // in their own program (see contracts/upgrade-contract.md).
  const u = new Recorder(true);
  const srv = createRouter().withUpgrade(u).serve({ port: 0 });
  assert.equal(srv.listenerCount("upgrade"), 0);
  await new Promise((r) => srv.on("listening", r));
  assert.equal(u.calls.length, 0);
  srv.close();
  srv.closeAllConnections();
});

test("documented wiring: serve() + typed upgradeHandler alias fires", async () => {
  const u = new Recorder(true);
  const app = createRouter().withUpgrade(u);
  const srv = app.serve({ port: 0 });
  const up = app.upgradeHandler();
  srv.on("upgrade", up);
  await new Promise((r) => srv.on("listening", r));
  const port = srv.address().port;
  const sock = net.connect(port, "127.0.0.1");
  sock.write("GET /ws HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n");
  await new Promise((r) => {
    const t = setInterval(() => {
      if (u.calls.length > 0) {
        clearInterval(t);
        r();
      }
    }, 5);
  });
  assert.equal(u.calls[0].req.url, "/ws");
  sock.destroy();
  srv.close();
  srv.closeAllConnections();
});

test("custom server wiring via upgradeHandler()", async () => {
  const app = createRouter().withUpgrade(new Recorder(false));
  const srv = http.createServer(app.handler());
  srv.on("upgrade", app.upgradeHandler());
  await new Promise((r) => srv.listen(0, r));
  const sock = net.connect(srv.address().port, "127.0.0.1");
  sock.write("GET /ws HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n");
  await new Promise((r) => sock.on("close", r));
  srv.close();
});
