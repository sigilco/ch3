// RFC 6455 framing: a non-recursive, incremental parser over Buffer.concat
// and a frame encoder. No permessage-deflate. Subset rules: no spread, no
// recursion, no function values in records, concrete types only.
import { Buffer } from "node:buffer";

export const OP_CONT = 0;
export const OP_TEXT = 1;
export const OP_BINARY = 2;
export const OP_CLOSE = 8;
export const OP_PING = 9;
export const OP_PONG = 10;

// WsParser.next() results.
export const P_NEED = 0;
export const P_FRAME = 1;
export const P_ERROR = 2;

export class WsParser {
  maxPayload: number;
  maxPending: number;
  pending: Buffer = Buffer.alloc(0);
  // Chunks fed but not yet merged into pending, and their byte total.
  // feed() only appends here; _contig() merges them once next() knows
  // enough bytes have arrived for the current frame, so a frame trickling
  // in byte by byte costs one concat per header stage, not one per chunk.
  queue: Buffer[] = [];
  queued: number = 0;
  // Total bytes (pending plus queued) next() needs before it can progress.
  need: number = 2;
  // Valid when next() returned P_FRAME.
  fin: boolean = false;
  opcode: number = 0;
  payload: Buffer = Buffer.alloc(0);
  // Valid when next() returned P_ERROR: the close code to answer with
  // (1002 protocol error, 1009 message too big).
  err: number = 0;

  constructor(maxPayload: number, maxPending: number) {
    this.maxPayload = maxPayload;
    this.maxPending = maxPending;
  }

  // Appends bytes read from the socket. Returns false when the pending
  // buffer would exceed maxPending; the caller must close with 1009.
  feed(chunk: Buffer): boolean {
    if (this.pending.length + this.queued + chunk.length > this.maxPending) {
      return false;
    }
    if (chunk.length > 0) {
      this.queue.push(chunk);
      this.queued += chunk.length;
    }
    return true;
  }

  // Merges queued chunks into pending with a single concat.
  _contig(): void {
    if (this.queued === 0) {
      return;
    }
    if (this.pending.length === 0 && this.queue.length === 1) {
      this.pending = this.queue[0];
    } else {
      const parts: Buffer[] = [this.pending];
      for (let i = 0; i < this.queue.length; i++) {
        parts.push(this.queue[i]);
      }
      this.pending = Buffer.concat(parts, this.pending.length + this.queued);
    }
    this.queue = [];
    this.queued = 0;
  }

  // Extracts at most one frame. Call in a loop until it returns P_NEED.
  next(): number {
    if (this.pending.length + this.queued < this.need) {
      return P_NEED;
    }
    this._contig();
    const p = this.pending;
    if (p.length < 2) {
      this.need = 2;
      return P_NEED;
    }
    const b0 = p[0];
    const b1 = p[1];
    const opcode = b0 & 15;
    if ((b0 & 112) !== 0) {
      this.err = 1002;
      return P_ERROR;
    }
    const isControl = opcode >= 8;
    if (isControl) {
      if (opcode > 10) {
        this.err = 1002;
        return P_ERROR;
      }
      if ((b0 & 128) === 0) {
        this.err = 1002;
        return P_ERROR;
      }
    } else if (opcode > 2) {
      this.err = 1002;
      return P_ERROR;
    }
    if ((b1 & 128) === 0) {
      // Client frames must be masked.
      this.err = 1002;
      return P_ERROR;
    }
    const l7 = b1 & 127;
    if (isControl && l7 > 125) {
      this.err = 1002;
      return P_ERROR;
    }
    let off = 2;
    let len = l7;
    if (l7 === 126) {
      if (p.length < 4) {
        this.need = 4;
        return P_NEED;
      }
      len = p[2] * 256 + p[3];
      off = 4;
    } else if (l7 === 127) {
      if (p.length < 10) {
        this.need = 10;
        return P_NEED;
      }
      const hi = p[2] * 16777216 + p[3] * 65536 + p[4] * 256 + p[5];
      if (hi !== 0) {
        this.err = 1009;
        return P_ERROR;
      }
      len = p[6] * 16777216 + p[7] * 65536 + p[8] * 256 + p[9];
      off = 10;
    }
    if (len > this.maxPayload) {
      this.err = 1009;
      return P_ERROR;
    }
    if (p.length < off + 4 + len) {
      this.need = off + 4 + len;
      return P_NEED;
    }
    const m0 = p[off];
    const m1 = p[off + 1];
    const m2 = p[off + 2];
    const m3 = p[off + 3];
    const start = off + 4;
    const out = Buffer.alloc(len);
    for (let i = 0; i < len; i++) {
      const m = i & 3;
      let k = m0;
      if (m === 1) {
        k = m1;
      } else if (m === 2) {
        k = m2;
      } else if (m === 3) {
        k = m3;
      }
      out[i] = p[start + i] ^ k;
    }
    this.fin = (b0 & 128) !== 0;
    this.opcode = opcode;
    this.payload = out;
    this.pending = p.subarray(start + len);
    this.need = 2;
    return P_FRAME;
  }
}

// Encodes one unmasked server frame (FIN set).
export function encodeFrame(opcode: number, payload: Buffer): Buffer {
  const n = payload.length;
  let hl = 2;
  if (n > 65535) {
    hl = 10;
  } else if (n > 125) {
    hl = 4;
  }
  const out = Buffer.alloc(hl + n);
  out[0] = 128 | opcode;
  if (hl === 2) {
    out[1] = n;
  } else if (hl === 4) {
    out[1] = 126;
    out[2] = Math.floor(n / 256);
    out[3] = n % 256;
  } else {
    out[1] = 127;
    out[6] = Math.floor(n / 16777216) % 256;
    out[7] = Math.floor(n / 65536) % 256;
    out[8] = Math.floor(n / 256) % 256;
    out[9] = n % 256;
  }
  for (let i = 0; i < n; i++) {
    out[hl + i] = payload[i];
  }
  return out;
}

// Close-code validity per RFC 6455 section 7.4 (codes a peer may send).
export function validCloseCode(code: number): boolean {
  if (code >= 3000 && code <= 4999) {
    return true;
  }
  if (code >= 1000 && code <= 1003) {
    return true;
  }
  return code >= 1007 && code <= 1014;
}
