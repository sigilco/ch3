// Verify the ELF round-trip: build the native server, start it, drive
// it with the typed client, assert every verb round-trips its expected
// shape, then kill the server.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const exampleRoot = dirname(here);
const serverBin = join(exampleRoot, "server");

if (!existsSync(serverBin)) {
  console.error("server ELF not found. Run `npm run build:server` first.");
  process.exit(1);
}

// Find a free port.
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

const proc = spawn(serverBin, [String(port)], {
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});
proc.stderr.on("data", (c) => process.stderr.write("[server] " + c.toString()));
proc.on("exit", (code) => {
  if (code !== null && code !== 0) {
    console.error("server exited with code " + String(code));
  }
});

// Wait for the listener to accept connections.
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

  // The client module is generated TS. We use --experimental-strip-types
  // so we can import it directly under node 22.12+.
  const clientPath = join(exampleRoot, "src", ".chttp", "routes.client.ts");
  const { createClient } = await import(pathToFileURL(clientPath).href);
  const api = createClient({ baseUrl });

  console.log("\n== round-trip checks (ELF server) ==\n");

  const hz = await api.get("/healthz");
  console.log("get /healthz    ->", hz);
  if (hz.ok !== true) throw new Error("expected {ok:true}");

  const u = await api.get("/user/:id", { params: { id: "42" } });
  console.log("get /user/:id   ->", u);
  if (u.id !== "42" || u.kind !== "user") throw new Error("expected {id:'42',kind:'user'}");

  const s = await api.get("/search", { query: { q: "hello" } });
  console.log("get /search     ->", s);
  if (s.q !== "hello") throw new Error("expected q='hello'");

  const e = await api.post("/echo", { body: { hello: "world" } });
  console.log("post /echo      ->", e);
  if (e.body !== JSON.stringify({ hello: "world" })) {
    throw new Error("expected echoed body, got: " + e.body);
  }

  const d = await api.delete("/user/:id", { params: { id: "7" } });
  console.log("delete /user/:id ->", d);
  if (d.deleted !== "7") throw new Error("expected deleted='7'");

  const w = await api.any("/whoami");
  console.log("any /whoami     ->", w);
  if (typeof w.method !== "string") throw new Error("expected method string");

  console.log("\nELF round-trip OK");
} catch (e) {
  console.error("\nELF round-trip FAILED:", e);
  proc.kill("SIGTERM");
  process.exit(1);
} finally {
  proc.kill("SIGTERM");
}
