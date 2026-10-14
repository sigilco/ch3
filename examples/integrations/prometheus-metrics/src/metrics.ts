// Subset-native Prometheus text exposition (format 0.0.4). No Map, no classes,
// no function-valued records: a metric is a plain record, families are arrays.

export interface Counter {
  name: string;
  help: string;
  keys: string[]; // rendered label sets, e.g. method="GET",status="200"
  values: number[];
}

export interface Histogram {
  name: string;
  help: string;
  bounds: number[];
  buckets: number[]; // per-bound (non-cumulative) counts, plus a last +Inf slot
  sum: number;
  count: number;
}

export function newCounter(name: string, help: string): Counter {
  return { name: name, help: help, keys: [], values: [] };
}

export function newHistogram(name: string, help: string, bounds: number[]): Histogram {
  const buckets: number[] = [];
  for (let i = 0; i <= bounds.length; i++) {
    buckets.push(0);
  }
  return { name: name, help: help, bounds: bounds, buckets: buckets, sum: 0, count: 0 };
}

// Escapes a label value per the exposition format: backslash, quote, newline.
export function escapeLabel(v: string): string {
  let out = "";
  for (let i = 0; i < v.length; i++) {
    const ch = v.charAt(i);
    if (ch === "\\") out += "\\\\";
    else if (ch === '"') out += '\\"';
    else if (ch === "\n") out += "\\n";
    else out += ch;
  }
  return out;
}

export function labels2(k1: string, v1: string, k2: string, v2: string): string {
  return k1 + '="' + escapeLabel(v1) + '",' + k2 + '="' + escapeLabel(v2) + '"';
}

export function inc(c: Counter, labelSet: string): void {
  for (let i = 0; i < c.keys.length; i++) {
    if (c.keys[i] === labelSet) {
      c.values[i] = c.values[i] + 1;
      return;
    }
  }
  c.keys.push(labelSet);
  c.values.push(1);
}

export function observe(h: Histogram, v: number): void {
  let slot = h.bounds.length;
  for (let i = 0; i < h.bounds.length; i++) {
    if (v <= h.bounds[i]) {
      slot = i;
      break;
    }
  }
  h.buckets[slot] = h.buckets[slot] + 1;
  h.sum = h.sum + v;
  h.count = h.count + 1;
}

export function renderCounter(c: Counter): string {
  let out = "# HELP " + c.name + " " + c.help + "\n# TYPE " + c.name + " counter\n";
  for (let i = 0; i < c.keys.length; i++) {
    out += c.name + "{" + c.keys[i] + "} " + c.values[i] + "\n";
  }
  return out;
}

export function renderHistogram(h: Histogram): string {
  let out = "# HELP " + h.name + " " + h.help + "\n# TYPE " + h.name + " histogram\n";
  let cumulative = 0;
  for (let i = 0; i < h.bounds.length; i++) {
    cumulative += h.buckets[i];
    out += h.name + '_bucket{le="' + h.bounds[i] + '"} ' + cumulative + "\n";
  }
  out += h.name + '_bucket{le="+Inf"} ' + h.count + "\n";
  out += h.name + "_sum " + h.sum + "\n";
  out += h.name + "_count " + h.count + "\n";
  return out;
}
