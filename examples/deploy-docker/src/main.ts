// Deploy template: the same scriptc-subset app that runs on node compiles to
// one static ELF. Two routes plus a --health mode so the binary can serve as
// its own container healthcheck (a FROM scratch image has no curl or wget).
import { createRouter } from "@chttp/router";

const started: number = Date.now();

// Health mode: exit 0 without binding a port. Used by the Dockerfile
// HEALTHCHECK. Must run before any serve call.
if (process.argv.length > 2 && process.argv[2] === "--health") {
  process.exit(0);
}

// Default port 8080 (unprivileged). Override with a positional arg:
//   docker run my-image 9090
const port: number = process.argv.length > 2 ? Number(process.argv[2]) : 8080;

const app = createRouter();

app.get("/", (c) => c.json({ ok: true, uptime: Date.now() - started }));
app.get("/hello", (c) => c.text("hello from chttp"));

app.serve({ port: port });
console.log("deploy-docker listening on :" + String(port));
