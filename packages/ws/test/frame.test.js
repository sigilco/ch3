import test from "node:test";
import assert from "node:assert/strict";
import { WsParser, encodeFrame, validCloseCode } from "../dist/esm/index.js";
import { clientFrame } from "./helpers.js";

const NEED = 0;
const FRAME = 1;
const ERROR = 2;

function parser(max = 1 << 20) {
  return new WsParser(max, max + 65536);
}

test("7-bit text frame, unmasked payload", () => {
  const p = parser();
  assert.equal(p.feed(clientFrame(1, Buffer.from("hello"))), true);
  assert.equal(p.next(), FRAME);
  assert.equal(p.opcode, 1);
  assert.equal(p.fin, true);
  assert.equal(p.payload.toString(), "hello");
  assert.equal(p.next(), NEED);
});

test("16-bit length", () => {
  const p = parser();
  const data = Buffer.alloc(300, 7);
  p.feed(clientFrame(2, data));
  assert.equal(p.next(), FRAME);
  assert.deepEqual(p.payload, data);
});

test("64-bit length", () => {
  const p = parser();
  const data = Buffer.alloc(70000, 9);
  p.feed(clientFrame(2, data));
  assert.equal(p.next(), FRAME);
  assert.equal(p.payload.length, 70000);
  assert.deepEqual(p.payload, data);
});

test("partial reads across chunks, byte by byte", () => {
  const p = parser();
  const f = clientFrame(1, Buffer.from("split me"));
  for (let i = 0; i < f.length - 1; i++) {
    p.feed(f.subarray(i, i + 1));
    assert.equal(p.next(), NEED, "need at byte " + i);
  }
  p.feed(f.subarray(f.length - 1));
  assert.equal(p.next(), FRAME);
  assert.equal(p.payload.toString(), "split me");
});

test("header split from 16-bit extended length", () => {
  const p = parser();
  const f = clientFrame(2, Buffer.alloc(200, 1));
  p.feed(f.subarray(0, 3));
  assert.equal(p.next(), NEED);
  p.feed(f.subarray(3, 50));
  assert.equal(p.next(), NEED);
  p.feed(f.subarray(50));
  assert.equal(p.next(), FRAME);
  assert.equal(p.payload.length, 200);
});

test("two frames in one chunk", () => {
  const p = parser();
  p.feed(Buffer.concat([clientFrame(1, Buffer.from("a")), clientFrame(1, Buffer.from("b"))]));
  assert.equal(p.next(), FRAME);
  assert.equal(p.payload.toString(), "a");
  assert.equal(p.next(), FRAME);
  assert.equal(p.payload.toString(), "b");
  assert.equal(p.next(), NEED);
});

test("fragment frames carry fin=false then continuation", () => {
  const p = parser();
  p.feed(clientFrame(1, Buffer.from("he"), { fin: false }));
  p.feed(clientFrame(0, Buffer.from("llo"), { fin: true }));
  assert.equal(p.next(), FRAME);
  assert.equal(p.fin, false);
  assert.equal(p.opcode, 1);
  assert.equal(p.next(), FRAME);
  assert.equal(p.fin, true);
  assert.equal(p.opcode, 0);
});

test("oversize payload is rejected from the header alone (1009)", () => {
  const p = new WsParser(100, 1000);
  p.feed(clientFrame(2, Buffer.alloc(101, 1)).subarray(0, 8));
  assert.equal(p.next(), ERROR);
  assert.equal(p.err, 1009);
});

test("64-bit length above 2^32 is 1009", () => {
  const p = parser();
  p.feed(clientFrame(2, Buffer.alloc(70000), { fakeLen: 2 ** 40 }).subarray(0, 14));
  assert.equal(p.next(), ERROR);
  assert.equal(p.err, 1009);
});

test("pending cap: feed refuses to buffer past maxPending", () => {
  const p = new WsParser(1000, 20);
  assert.equal(p.feed(Buffer.alloc(15)), true);
  assert.equal(p.feed(Buffer.alloc(6)), false);
});

test("invalid opcode 3 and 11 are 1002", () => {
  for (const op of [3, 7, 11, 15]) {
    const p = parser();
    p.feed(clientFrame(op, Buffer.alloc(0)));
    assert.equal(p.next(), ERROR, "opcode " + op);
    assert.equal(p.err, 1002);
  }
});

test("unmasked client frame is 1002", () => {
  const p = parser();
  p.feed(clientFrame(1, Buffer.from("x"), { masked: false }));
  assert.equal(p.next(), ERROR);
  assert.equal(p.err, 1002);
});

test("reserved bits set is 1002", () => {
  const p = parser();
  p.feed(clientFrame(1, Buffer.from("x"), { rsv: 0x40 }));
  assert.equal(p.next(), ERROR);
  assert.equal(p.err, 1002);
});

test("fragmented control frame is 1002; oversized control frame is 1002", () => {
  let p = parser();
  p.feed(clientFrame(9, Buffer.from("x"), { fin: false }));
  assert.equal(p.next(), ERROR);
  assert.equal(p.err, 1002);
  p = parser();
  p.feed(clientFrame(9, Buffer.alloc(126)));
  assert.equal(p.next(), ERROR);
  assert.equal(p.err, 1002);
});

test("ping and close parse as control frames", () => {
  const p = parser();
  p.feed(clientFrame(9, Buffer.from("pp")));
  assert.equal(p.next(), FRAME);
  assert.equal(p.opcode, 9);
  p.feed(clientFrame(8, Buffer.from([0x03, 0xe8])));
  assert.equal(p.next(), FRAME);
  assert.equal(p.opcode, 8);
  assert.deepEqual(p.payload, Buffer.from([0x03, 0xe8]));
});

test("encodeFrame: 7, 16 and 64-bit headers", () => {
  const a = encodeFrame(1, Buffer.from("hi"));
  assert.deepEqual(a, Buffer.from([0x81, 2, 0x68, 0x69]));
  const b = encodeFrame(2, Buffer.alloc(300, 1));
  assert.equal(b[1], 126);
  assert.equal(b.readUInt16BE(2), 300);
  assert.equal(b.length, 304);
  const c = encodeFrame(2, Buffer.alloc(70000, 1));
  assert.equal(c[1], 127);
  assert.equal(c.readBigUInt64BE(2), 70000n);
  assert.equal(c.length, 70010);
});

test("validCloseCode", () => {
  for (const c of [1000, 1001, 1002, 1003, 1007, 1011, 1012, 1013, 1014, 3000, 4999])
    assert.equal(validCloseCode(c), true, String(c));
  for (const c of [0, 999, 1004, 1005, 1006, 1015, 2999, 5000])
    assert.equal(validCloseCode(c), false, String(c));
});

test("feed is linear: a trickled frame concatenates a bounded number of times", () => {
  const data = Buffer.alloc(20000, 7);
  const f = clientFrame(2, data);
  const p = new WsParser(1 << 20, 1 << 21);
  const orig = Buffer.concat;
  let calls = 0;
  Buffer.concat = (...a) => {
    calls++;
    return orig.apply(Buffer, a);
  };
  let got = null;
  try {
    for (let i = 0; i < f.length; i++) {
      p.feed(f.subarray(i, i + 1));
      if (p.next() === FRAME) got = p.payload;
    }
  } finally {
    Buffer.concat = orig;
  }
  assert.ok(got && got.equals(data));
  assert.ok(calls <= 4, "concat calls: " + calls);
  assert.equal(p.queued, 0);
});
