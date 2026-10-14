// Client-side frame builder for tests: masked by default.
export function clientFrame(opcode, payload, o = {}) {
  const fin = o.fin === undefined ? true : o.fin;
  const masked = o.masked === undefined ? true : o.masked;
  const n = payload.length;
  const key = Buffer.from([0x12, 0x34, 0x56, 0x78]);
  let h;
  if (n < 126) h = Buffer.from([(fin ? 128 : 0) | (o.rsv || 0) | opcode, (masked ? 128 : 0) | n]);
  else if (n < 65536) {
    h = Buffer.alloc(4);
    h[0] = (fin ? 128 : 0) | opcode;
    h[1] = (masked ? 128 : 0) | 126;
    h.writeUInt16BE(n, 2);
  } else {
    h = Buffer.alloc(10);
    h[0] = (fin ? 128 : 0) | opcode;
    h[1] = (masked ? 128 : 0) | 127;
    h.writeBigUInt64BE(BigInt(o.fakeLen === undefined ? n : o.fakeLen), 2);
  }
  if (!masked) return Buffer.concat([h, payload]);
  const body = Buffer.alloc(n);
  for (let i = 0; i < n; i++) body[i] = payload[i] ^ key[i & 3];
  return Buffer.concat([h, key, body]);
}
