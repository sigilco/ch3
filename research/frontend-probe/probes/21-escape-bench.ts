import { escapeHtml, escapeHtmlChar } from "../lib/html.ts";

function dirty(n: number): string {
  let s = "";
  const bits: string[] = ["a", "<", ">", "&", '"', "'", "x"];
  for (let i = 0; i < n; i++) {
    s = s + bits[i % bits.length];
  }
  return s;
}

const input = dirty(2048);
const mode = process.argv.length > 2 ? String(process.argv[2]) : "split";
const rounds = process.argv.length > 3 ? Number(process.argv[3]) : 20000;

const t0 = Date.now();
let last = "";
if (mode === "char") {
  for (let i = 0; i < rounds; i++) {
    last = escapeHtmlChar(input);
  }
} else {
  for (let i = 0; i < rounds; i++) {
    last = escapeHtml(input);
  }
}
const ms = Date.now() - t0;
console.log(mode + " " + String(rounds) + " " + String(ms) + " " + String(last.length));
