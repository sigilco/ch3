// Fixed window rate limiter with a hard memory bound.
//
// Keys hash into SLOTS buckets held in parallel arrays (no Map, no delete).
// A bucket owned by another key is taken over, so a flood of unique keys can
// never grow memory; it can only reset a neighbour's window (fails open).
export const SLOTS = 1024;

export class Limiter {
  limit: number;
  windowMs: number;
  keys: string[];
  counts: number[];
  starts: number[];

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.keys = [];
    this.counts = [];
    this.starts = [];
    for (let i = 0; i < SLOTS; i++) {
      this.keys.push("");
      this.counts.push(0);
      this.starts.push(0);
    }
  }

  // Returns 0 when allowed, otherwise the seconds until the window resets.
  hit(key: string, now: number): number {
    const i = slotOf(key);
    if (this.keys[i] !== key || now - this.starts[i] >= this.windowMs) {
      this.keys[i] = key;
      this.counts[i] = 0;
      this.starts[i] = now;
    }
    if (this.counts[i] >= this.limit) {
      return Math.ceil((this.starts[i] + this.windowMs - now) / 1000);
    }
    this.counts[i] = this.counts[i] + 1;
    return 0;
  }

  remaining(key: string): number {
    const i = slotOf(key);
    if (this.keys[i] !== key) {
      return this.limit;
    }
    return this.limit - this.counts[i];
  }
}

function slotOf(key: string): number {
  let h = 5381;
  for (let i = 0; i < key.length; i++) {
    h = (h * 33 + key.charCodeAt(i)) % 1000003;
  }
  return h % SLOTS;
}
