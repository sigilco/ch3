// Micro-bench: escape strategies (run under node and scriptc ELF)

import { escapeHtmlCharCode, escapeHtmlSplitJoin } from "./html-escape.ts";

const SAMPLE =
  '<script>alert("x")</script> & "quotes" \'apostrophe\' normal text repeated. '.repeat(
    32,
  );

function bench(name: string, fn: (s: string) => string): number {
  const t0 = Date.now();
  let i = 0;
  let acc = "";
  while (i < 50000) {
    acc = fn(SAMPLE);
    i = i + 1;
  }
  const ms = Date.now() - t0;
  if (acc.length < 10) {
    return ms;
  }
  return ms;
}

const a = bench("charCodeAt", escapeHtmlCharCode);
const b = bench("splitJoin", escapeHtmlSplitJoin);
console.log(JSON.stringify({ charCodeAt_ms: a, splitJoin_ms: b, ratio: a / b }));
