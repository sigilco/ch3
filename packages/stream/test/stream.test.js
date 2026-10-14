// Unit tests for @chttp/stream: real HTTP round-trips against the tsc build.
// The same src compiles to a native binary; see bench/apps/chttp-stream.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createRouter } from "@chttp/router";
import { streamSSE, streamText, SSEStream } from "../dist/esm/index.js";

async function serve(setup) {
  const app = createRouter();
  setup(app);
  const srv = app.serve({ port: 0 });
  await new Promise((r) => srv.on("listening", r));
  return { srv, base: "http://127.0.0.1:" + srv.address().port };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("streamSSE: headers and event framing", async () => {
  const { srv, base } = await serve((app) =>
    app.get("/e", (c) =>
      streamSSE(c, (s) => {
        s.retry(1500);
        s.comment("hi");
        s.send("plain");
        s.send("named", "tick");
        s.send("full", "tick", "7");
        s.close();
      }),
    ),
  );
  const r = await fetch(base + "/e");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /^text\/event-stream/);
  assert.equal(r.headers.get("cache-control"), "no-cache, no-transform");
  assert.equal(
    await r.text(),
    "retry: 1500\n\n: hi\n\ndata: plain\n\nevent: tick\ndata: named\n\nid: 7\nevent: tick\ndata: full\n\n",
  );
  srv.close();
});

test("send: multi-line data is split and CR/LF cannot inject fields", async () => {
  const { srv, base } = await serve((app) =>
    app.get("/e", (c) =>
      streamSSE(c, (s) => {
        s.send("a\nb\r\nc\rd");
        s.send("x\n");
        s.send("", "e\nid: evil", "1\r2");
        s.comment("m1\nm2");
        s.close();
      }),
    ),
  );
  const t = await (await fetch(base + "/e")).text();
  assert.equal(
    t,
    "data: a\ndata: b\ndata: c\ndata: d\n\n" +
      "data: x\ndata: \n\n" +
      "id: 12\nevent: eid: evil\ndata: \n\n" +
      ": m1\n: m2\n\n",
  );
  srv.close();
});

test("a streaming handler is never answered with a 500", async () => {
  const { srv, base } = await serve((app) => app.get("/e", (c) => streamSSE(c, () => undefined)));
  const ac = new AbortController();
  const r = await fetch(base + "/e", { signal: ac.signal });
  assert.equal(r.status, 200);
  ac.abort();
  srv.close();
  srv.closeAllConnections();
});

test("async callback: events written after awaits reach the client", async () => {
  const { srv, base } = await serve((app) =>
    app.get("/e", (c) =>
      streamSSE(c, async (s) => {
        s.send("one");
        await wait(20);
        s.send("two");
        s.close();
      }),
    ),
  );
  assert.equal(await (await fetch(base + "/e")).text(), "data: one\n\ndata: two\n\n");
  srv.close();
});

test("onAbort fires when the client disconnects and the timer stops", async () => {
  let aborted = 0;
  let ticks = 0;
  const { srv, base } = await serve((app) =>
    app.get("/e", (c) =>
      streamSSE(c, (s) => {
        const t = setInterval(() => {
          ticks++;
          s.send("t");
        }, 10);
        s.onAbort(() => {
          aborted++;
          clearInterval(t);
        });
      }),
    ),
  );
  await new Promise((resolve) => {
    const req = http.get(base + "/e", (res) => {
      res.once("data", () => {
        req.destroy();
        resolve();
      });
    });
  });
  await wait(80);
  assert.equal(aborted, 1);
  const after = ticks;
  await wait(60);
  assert.equal(ticks, after, "interval cleared");
  srv.close();
});

test("close() ends the response, fires onAbort once, later writes are no-ops", async () => {
  let aborted = 0;
  let late = true;
  const { srv, base } = await serve((app) =>
    app.get("/e", (c) =>
      streamSSE(c, (s) => {
        s.onAbort(() => aborted++);
        s.send("x");
        s.close();
        s.close();
        late = s.send("y");
      }),
    ),
  );
  assert.equal(await (await fetch(base + "/e")).text(), "data: x\n\n");
  await wait(30);
  assert.equal(aborted, 1);
  assert.equal(late, false);
  srv.close();
});

test("onAbort registered after the connection closed runs immediately", async () => {
  let s0;
  const { srv, base } = await serve((app) =>
    app.get("/e", (c) =>
      streamSSE(c, (s) => {
        s0 = s;
        s.close();
      }),
    ),
  );
  await (await fetch(base + "/e")).text();
  await wait(30);
  let ran = false;
  s0.onAbort(() => (ran = true));
  assert.equal(ran, true);
  srv.close();
});

test("pending-bytes cap closes slow consumers", async () => {
  let wrote = [];
  let aborted = 0;
  const { srv, base } = await serve((app) =>
    app.get("/e", (c) =>
      streamSSE(c, (s) => {
        s.maxPending = 100;
        s.onAbort(() => aborted++);
        wrote.push(s.send("a".repeat(40)));
        wrote.push(s.send("b".repeat(40)));
        wrote.push(s.send("c".repeat(40)));
        wrote.push(s.send("d"));
      }),
    ),
  );
  const t = await (await fetch(base + "/e")).text();
  assert.deepEqual(wrote, [true, true, false, false]);
  assert.equal(t, "data: " + "a".repeat(40) + "\n\ndata: " + "b".repeat(40) + "\n\n");
  await wait(30);
  assert.equal(aborted, 1);
  srv.close();
});

test("pending window resets so steady streams are not closed", async () => {
  const { srv, base } = await serve((app) =>
    app.get("/e", (c) =>
      streamSSE(c, async (s) => {
        s.maxPending = 30;
        s.windowMs = 20;
        for (let i = 0; i < 4; i++) {
          assert.equal(s.send("0123456789"), true);
          await wait(30);
        }
        s.close();
      }),
    ),
  );
  const t = await (await fetch(base + "/e")).text();
  assert.equal(t.split("data: ").length - 1, 4);
  srv.close();
});

test("utf8 payloads count by bytes toward the cap", async () => {
  const { srv, base } = await serve((app) =>
    app.get("/e", (c) =>
      streamSSE(c, (s) => {
        s.maxPending = 20;
        // "data: " is not counted twice: frame is 6 + 4*3 + 2 = 20 bytes (3-byte chars), at the cap
        assert.equal(s.send("€€€€"), true);
        assert.equal(s.send("x"), false);
      }),
    ),
  );
  await (await fetch(base + "/e")).text();
  srv.close();
});

test("streamText: chunked text with writeln", async () => {
  const { srv, base } = await serve((app) =>
    app.get("/t", (c) =>
      streamText(c, async (s) => {
        s.write("a");
        await wait(10);
        s.writeln("b");
        s.close();
      }),
    ),
  );
  const r = await fetch(base + "/t");
  assert.match(r.headers.get("content-type"), /^text\/plain/);
  assert.equal(r.headers.get("content-length"), null);
  assert.equal(await r.text(), "ab\n");
  srv.close();
});

test("headers set before streamSSE are preserved", async () => {
  const { srv, base } = await serve((app) =>
    app.get("/e", (c) => {
      c.header("x-custom", "1");
      return streamSSE(c, (s) => s.close());
    }),
  );
  const r = await fetch(base + "/e");
  assert.equal(r.headers.get("x-custom"), "1");
  await r.text();
  srv.close();
});

test("exports SSEStream class", () => {
  assert.equal(typeof SSEStream, "function");
});
