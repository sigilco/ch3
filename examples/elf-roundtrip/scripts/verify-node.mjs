// Verify the node path: run src/server.ts under
// `--experimental-strip-types` (no ELF build, no scriptc) and drive
// it with the typed client emitted by @chttp/unplugin. This proves
// the unplugin's emit is consumable as plain TS by a plain node
// process — the same module that compiles into the ELF on the
// scriptc path.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const exampleRoot = dirname(here);
const serverPath = join(exampleRoot, "src", "server.ts");

if (!existsSync(serverPath)) {
  console.error("src/server.ts not found.");
  process.exit(1);
}

const openapiPath = join(exampleRoot, "src", ".chttp", "routes.openapi.ts");
const clientPath = join(exampleRoot, "src", ".chttp", "routes.client.ts");
if (!existsSync(openapiPath) || !existsSync(clientPath)) {
  console.error("Typed client not emitted. Run `npm run build:client` first.");
  process.exit(1);
}

const net = await import("node:net");
const port = await new Promise((res, rej) => {
  const s = net.createServer();
  s.listen(0, "127.0.0.1", () => {
    const a = s.address();
    const p = typeof a === "object" && a !== null ? a.port : 0;
    s.close(() => res(p));
  });
  s.on("error", rej);
});
const baseUrl = "http://127.0.0.1:" + String(port);

const proc = spawn(
  process.execPath,
  ["--experimental-strip-types", "--no-warnings", serverPath],
  {
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
proc.stderr.on("data", (c) => process.stderr.write("[server] " + c.toString()));

async function waitForReady(maxMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const r = await fetch(baseUrl + "/healthz");
      if (r.ok) return;
    } catch {
      // not ready
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("server did not become ready within " + String(maxMs) + "ms");
}

try {
  await waitForReady();

  const { createClient } = await import(pathToFileURL(clientPath).href);
  const api = createClient({ baseUrl });

  console.log("\n== round-trip checks (node server) ==\n");

  const hz = await api.get("/healthz");
  console.log("get /healthz    ->", hz);
  if (hz.ok !== true) throw new Error("expected {ok:true}");

  const u = await api.get("/user/:id", { params: { id: "abc" } });
  console.log("get /user/:id   ->", u);
  if (u.id !== "abc" || u.kind !== "user") throw new Error("expected {id:'abc',kind:'user'}");

  const s = await api.get("/search", { query: { q: "world" } });
  console.log("get /search     ->", s);
  if (s.q !== "world") throw new Error("expected q='world'");

  const e = await api.post("/echo", { body: { ping: 1 } });
  console.log("post /echo      ->", e);
  if (e.body !== JSON.stringify({ ping: 1 })) {
    throw new Error("expected echoed body, got: " + e.body);
  }

  const w = await api.any("/whoami");
  console.log("any /whoami     ->", w);
  if (typeof w.method !== "string") throw new Error("expected method string");

  console.log("\nnode round-trip OK");
} catch (e) {
  console.error("\nnode round-trip FAILED:", e);
  proc.kill("SIGTERM");
  process.exit(1);
} finally {
  proc.kill("SIGTERM");
}
