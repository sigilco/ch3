import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

// Build-side lowerer. Runs in Node, never under scriptc. Turns a one-line
// template into subset-clean string concatenation plus esc() calls.
const src = readFileSync(new URL("./home.view", import.meta.url), "utf8");
const lines = src.split("\n").filter((l) => l.length > 0);
const head = lines[0];
const body = lines.slice(1).join("");
const m = /^fn ([A-Za-z0-9_]+)\((.*)\)$/.exec(head);
if (m === null) {
  throw new Error("bad signature");
}
const name = m[1];
const args = m[2];
let expr = '"';
let i = 0;
while (i < body.length) {
  if (body[i] === "{") {
    const end = body.indexOf("}", i);
    if (end < 0) {
      throw new Error("unclosed hole");
    }
    const ident = body.slice(i + 1, end);
    expr += '" + esc(' + ident + ') + "';
    i = end + 1;
  } else if (body[i] === '"') {
    expr += '\\"';
    i += 1;
  } else {
    expr += body[i];
    i += 1;
  }
}
expr += '"';
const out =
  "import { esc } from \"../lib/html.ts\";\n\n" +
  "export function " +
  name +
  "(" +
  args +
  "): string {\n" +
  "  return " +
  expr +
  ";\n" +
  "}\n";
mkdirSync(new URL("../src/gen/", import.meta.url), { recursive: true });
writeFileSync(new URL("../src/gen/home.ts", import.meta.url), out);
console.log(out);
