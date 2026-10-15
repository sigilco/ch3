// scriptc lowers subclasses of package classes only when the whole graph is
// program code (docs/websocket.md, "Compiling to a native binary"). This
// copies the router and ws sources into .vendor/ and points ws at the
// vendored router, so `scriptc build src/main.ts` sees one source graph.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const out = join(root, ".vendor");

function srcOf(name) {
  const mono = resolve(root, "../../packages", name, "src");
  if (existsSync(mono)) return mono;
  return join(root, "node_modules/@chttp", name, "src");
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(srcOf("router"), join(out, "router"), { recursive: true });
cpSync(srcOf("ws"), join(out, "ws"), { recursive: true });
for (const f of readdirSync(join(out, "ws"))) {
  if (!f.endsWith(".ts")) continue;
  const p = join(out, "ws", f);
  writeFileSync(p, readFileSync(p, "utf8").replaceAll('"@chttp/router"', '"../router/index.ts"'));
}

// The FFI manifest lands next to where the build script places the compiled
// ffi_native.o, so its relative `libraries` entry resolves.
cpSync(join(root, "ffi.json"), join(out, "ffi.json"));
