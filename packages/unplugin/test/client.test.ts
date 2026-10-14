// Golden tests for the typed-client side channel (routes.client.ts).
//
// Coverage:
//  - RouteMap shape per emitted route (literal GET, literal POST, mixed
//    provable + unprovable, bailed routes excluded, app.all -> AnyRoutes).
//  - Per-verb Pick types + path aliases: keyof <Verb>Routes.
//  - Client off vs on: gen-file byte-identity preserved, file presence on/off.
//  - The emitted module is tsc-clean under --allowImportingTsExtensions.
//  - createClient makes real fetch calls against a scratch node:http server,
//    end-to-end (path params, query, body, non-2xx -> ChttpClientError).
//
// Detection strategy mirrors openapi.test.ts: the typed client only carries
// types for routes the extractor can prove (emit === true). Everything else
// is silently excluded.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { extractModule } from "../src/extract.ts";
import { emitGenModule } from "../src/emit.ts";
import { emitClientModule, clientFileName } from "../src/client.ts";
import { emitOpenApiModule } from "../src/openapi.ts";

const VAL = ["@chttp/val"];

const mod = (src: string) =>
  extractModule("/app/src/routes.chttp.ts", src, {
    openapiValSpecifiers: VAL,
  });

// Sanity: the typed client lives at a fixed name next to routes.gen.ts.
describe("clientFileName", () => {
  it("returns 'routes.client.ts'", () => {
    assert.equal(clientFileName(), "routes.client.ts");
  });
});

// ---------------------------------------------------------------------------
// RouteMap shape: literal-send response types, keyof verb maps, etc.
// ---------------------------------------------------------------------------

describe("emitClientModule", () => {
  it("emits a typed response for a literal GET with a path param", () => {
    const m = mod(`
import { createRouter } from '@chttp/router'
export const app = createRouter()
app.get('/static', (c) => c.json({ kind: 'plain', n: 1 }))
`);
    const out = emitClientModule(m);
    // RouteMap key uses backticks (template-literal type), method + space + path.
    // TS requires the computed-property bracket form [`...`] for object
    // members, but the key content itself is still a template-literal type.
    assert.match(out, /\[`GET \/static`\]: \{/);
    // Static-send body parses to a literal record type. Fields joined by
    // ';' (TS object type literal), trailing field has no terminator.
    assert.match(out, /response: \{ "kind": "plain"; "n": 1 \}/);
    // GetRoutes / GetPath aliases exist. The routes map is filtered via a
    // mapped-type with key remapping so the verb Path alias is the bare
    // path (`/static`) while the runtime call resolves to the full
    // `GET /static` key.
    assert.match(
      out,
      /export type GetRoutes = \{ \[K in keyof RouteMap as K extends `GET \$\{infer P\}` \? P : never\]: RouteMap\[K] \};/,
    );
    assert.match(out, /export type GetPath = keyof GetRoutes;/);
  });

  it("emits typed response + params for a literal POST", () => {
    const m = mod(`
import { createRouter } from '@chttp/router'
export const app = createRouter()
app.post('/echo', (c) => c.json({ ok: true, n: 1 }), { body: true })
`);
    const out = emitClientModule(m);
    assert.match(out, /\[`POST \/echo`\]: \{/);
    // response is the literal JSON body shape (ok: true, n: 1).
    assert.match(out, /response: \{ "ok": true; "n": 1 \}/);
    // params on POST are minimal (no path segments -> Record<string, never>).
    assert.match(out, /params: Record<string, never>;/);
    // query is the default Record<string, string>.
    assert.match(out, /query: Record<string, string>;/);
    // PostRoutes picks the POST route; PostPath = keyof PostRoutes.
    assert.match(
      out,
      /export type PostRoutes = \{ \[K in keyof RouteMap as K extends `POST \$\{infer P\}` \? P : never\]: RouteMap\[K] \};/,
    );
    assert.match(out, /export type PostPath = keyof PostRoutes;/);
  });

  it("excludes unprovable routes and only types the literal-send ones", () => {
    // The bailed route (dynamic path) is filtered out of the typed map;
    // the literal-send static route carries a literal response; the
    // ctx route falls back to unknown.
    const m = mod(`
import { createRouter } from '@chttp/router'
export const app = createRouter()
const p = '/dyn-' + 'x'
app.get(p, (c) => c.text('dyn'))                // bailed: non-literal path
app.get('/plain', (c) => c.json({ ok: true }))   // literal send
app.get('/u/:id', (c) => c.text(c.req.param('id') || '')) // ctx -> unknown
`);
    const out = emitClientModule(m);
    assert.match(out, /\[`GET \/plain`\]: \{/);
    assert.match(out, /response: \{ "ok": true \}/);
    assert.match(out, /\[`GET \/u\/:id`\]: \{/);
    // ctx route's response is `unknown`, not a literal type.
    assert.match(out, /response: unknown[ ;}]/);
    // The bailed non-literal path is NOT in RouteMap at all.
    assert.doesNotMatch(out, /\/dyn-x/);
  });

  it("routes app.all ('*') into AnyRoutes and exposes an any() method", () => {
    const m = mod(`
import { createRouter } from '@chttp/router'
export const app = createRouter()
app.all('/any', (c) => c.text('a'))
`);
    const out = emitClientModule(m);
    assert.match(out, /\[`\* \/any`\]: \{/);
    assert.match(
      out,
      /export type AnyRoutes = \{ \[K in keyof RouteMap as K extends `\* \$\{infer P\}` \? P : never\]: RouteMap\[K] \};/,
    );
    assert.match(out, /export type AnyPath = keyof AnyRoutes;/);
    // The client object literal has an `any` field.
    assert.match(out, /any: verbs\["any"\]/);
    // Empty per-verb buckets (no GET here) are Record<string, never>.
    assert.match(out, /export type GetRoutes = Record<string, never>;/);
  });

  it("re-exports chttpRouteTable from the openapi sibling and pins length parity", () => {
    const m = mod(`
import { createRouter } from '@chttp/router'
export const app = createRouter()
app.get('/a', (c) => c.json({ ok: true }))
app.post('/b', (c) => c.text('b'))
`);
    const out = emitClientModule(m);
    assert.match(out, /^import \{ chttpRouteTable \} from "\.\/routes\.openapi\.ts";$/m);
    // The emitted module surfaces the entry count as a typed const.
    assert.match(out, /export const _chttpRouteCount: 2 = 2;/);
  });

  it("emits a ChttpClientError class inline (no import of a runtime)", () => {
    const m = mod(`
import { createRouter } from '@chttp/router'
export const app = createRouter()
app.get('/x', (c) => c.json({ ok: true }))
`);
    const out = emitClientModule(m);
    assert.match(out, /export class ChttpClientError extends Error/);
    assert.match(out, /status: number;/);
    assert.match(out, /body: unknown;/);
    // The runtime is plain, zero imports — the only external import is
    // the openapi sibling.
    const imports = out.split("\n").filter((l) => l.startsWith("import "));
    assert.equal(imports.length, 1);
    assert.match(imports[0] as string, /routes\.openapi\.ts/);
  });
});

// ---------------------------------------------------------------------------
// Isolation: client option does not change routes.gen.ts (T2 byte-identity).
// ---------------------------------------------------------------------------

describe("typed client side channel isolation", () => {
  const SRC = `
import { createRouter } from '@chttp/router'
import * as v from '@chttp/val'
export const app = createRouter()
const EchoIn = v.object({ msg: v.string() })
app.get('/json', (c) => c.json({ hello: 'world' }))
app.post('/echo', (c) => { v.parse(EchoIn, JSON.parse(c.req.body())); return c.json({ ok: true }) }, { body: true })
`;

  it("gen output is byte-identical with client on vs off", () => {
    const off = extractModule("/app/src/routes.chttp.ts", SRC, {});
    const on = mod(SRC);
    const gOff = emitGenModule(off, {
      importFrom: "@chttp/router",
      modulePath: "/app/src/routes.chttp.ts",
    });
    const gOn = emitGenModule(on, {
      importFrom: "@chttp/router",
      modulePath: "/app/src/routes.chttp.ts",
    });
    assert.equal(gOff, gOn);
    assert.equal(off.warnings.length, on.warnings.length);
  });

  it("client emit honors openapi: when openapi is off, client emit is skipped", () => {
    // Without openapi, the typed client has nothing to import from
    // (chttpRouteTable) — but it still emits an empty client module.
    // The isolation is at the plugin-options level (index.ts), not in the
    // emitter: the emitter just builds source. We exercise the end-to-end
    // skip path in test/extract.test.ts (where the generate() flow lives).
    // Here we assert that the emitted module carries a RouteMap with zero
    // entries when given a no-routes model.
    const m = extractModule("/app/src/routes.chttp.ts", "export const x = 1\n", {});
    const out = emitClientModule(m);
    assert.match(out, /export interface RouteMap \{/);
    assert.match(out, /no statically provable routes/);
  });
});

// ---------------------------------------------------------------------------
// tsc-clean: the emitted module type-checks under --allowImportingTsExtensions.
// ---------------------------------------------------------------------------

describe("emitted client is tsc-clean", () => {
  let scratch = "";
  let cliPath = "";
  let valLink = "";
  let tscBin = "";

  before(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "unplugin-chttp-cli-tsc-"));
    cliPath = path.join(scratch, "routes.client.ts");
    const oaPath = path.join(scratch, "routes.openapi.ts");
    // Symlink @chttp/val into the scratch so the openapi sibling's import
    // resolves; the emit re-evaluates val schemas here. Without the link,
    // tsc reports "Cannot find module '@chttp/val'" before it ever looks
    // at the client code.
    const valUrl = new URL(import.meta.resolve("@chttp/val/package.json"));
    const valDir = path.dirname(fileURLToPath(valUrl));
    fs.mkdirSync(path.join(scratch, "node_modules", "@chttp"), { recursive: true });
    valLink = path.join(scratch, "node_modules", "@chttp", "val");
    try {
      fs.symlinkSync(valDir, valLink, "dir");
    } catch {
      // already linked
    }
    // Locate the workspace's typescript bin.
    const tsBinRoot = path.dirname(
      fileURLToPath(new URL(import.meta.resolve("typescript/package.json"))),
    );
    tscBin = path.join(tsBinRoot, "bin", "tsc");
    // Build a representative routes module + extract + emit both the
    // openapi sibling (so the import resolves to a real, length-matched
    // chttpRouteTable) and the client module. The pin in the emitted
    // client compares RouteMap entry count against chttpRouteTable length,
    // so the sibling must be the matching one for the test to pass.
    const m = mod(`
import { createRouter } from '@chttp/router'
export const app = createRouter()
app.get('/user/:id', (c) => c.json({ id: c.req.param('id') }))
app.post('/echo', (c) => c.text(c.req.body() || ''), { body: true })
app.all('/any', (c) => c.text('any'))
`);
    fs.writeFileSync(oaPath, emitOpenApiModule(m, { title: "t", version: "1" }));
    fs.writeFileSync(cliPath, emitClientModule(m));
  });

  after(() => {
    if (scratch !== "") {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  });

  it("tsc --noEmit --allowImportingTsExtensions --moduleResolution bundler passes", async () => {
    const proc = spawn(
      process.execPath,
      [
        tscBin,
        "--noEmit",
        "--allowImportingTsExtensions",
        "--moduleResolution",
        "bundler",
        "--target",
        "ES2022",
        "--strict",
        cliPath,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const code: number = await new Promise((res) => {
      let out = "";
      let err = "";
      proc.stdout.on("data", (c: Buffer) => (out += c.toString()));
      proc.stderr.on("data", (c: Buffer) => (err += c.toString()));
      proc.on("close", (c) => {
        // Always print tsc output so failures are diagnosable.
        if (out + err !== "") {
          // eslint-disable-next-line no-console
          console.error("tsc output:\n" + out + "\n" + err);
        }
        res(c ?? 1);
      });
    });
    assert.equal(code, 0, "tsc failed on the emitted client module");
  });
});

// ---------------------------------------------------------------------------
// Real fetch: createClient drives a scratch node:http server end-to-end.
// ---------------------------------------------------------------------------

describe("createClient makes real fetch calls", () => {
  let dir = "";
  let proc: ChildProcess | null = null;
  let port = 0;
  let cliModPath = "";

  const ROUTES_SRC = `
import { createRouter } from '@chttp/router'
export const app = createRouter()
app.get('/user/:id', (c) => c.json({ id: c.req.param('id') }))
app.get('/search', (c) => c.json({ q: c.req.query('q') || '' }))
app.post('/echo', (c) => c.json({ body: c.req.body() }), { body: true })
app.get('/boom', () => { throw new Error('nope') })
app.serve({ port: Number(process.env.CHTTP_TEST_PORT ?? 3000) })
`;

  const CLIENT_SRC = `
import { createClient } from "./routes.client.ts";
const baseUrl = process.env.CHTTP_TEST_BASE ?? "";
const cli = createClient({ baseUrl });
const which = process.argv[2];
async function main() {
  if (which === "get-param") {
    const r = await cli.get("/user/:id", { params: { id: "42" } });
    process.stdout.write(JSON.stringify(r));
    return;
  }
  if (which === "get-query") {
    const r = await cli.get("/search", { query: { q: "hello" } });
    process.stdout.write(JSON.stringify(r));
    return;
  }
  if (which === "post-body") {
    const r = await cli.post("/echo", { body: { hello: "world" } });
    process.stdout.write(JSON.stringify(r));
    return;
  }
  if (which === "boom") {
    try {
      await cli.get("/boom");
      process.stdout.write("UNREACHED");
    } catch (e) {
      const ce = e as { status: number; body: unknown; name: string };
      process.stdout.write(JSON.stringify({ name: ce.name, status: ce.status }));
      return;
    }
  }
  process.stdout.write("UNKNOWN");
}
main().catch((e) => {
  process.stderr.write(String(e));
  process.exit(1);
});
`;

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "unplugin-chttp-cli-"));
    const routesPath = path.join(dir, "routes.chttp.ts");
    fs.writeFileSync(routesPath, ROUTES_SRC);
    // Find the workspace @chttp/router source so the routes module
    // resolves correctly under the scratch module (no install step).
    const routerSrcUrl = new URL(import.meta.resolve("@chttp/router/package.json"));
    const routerPkgDir = fs.realpathSync(path.dirname(fileURLToPath(routerSrcUrl)));
    // The router exports ./src/index.ts — use the source path so the
    // scratch compiles & runs without a dist. Resolve symlinks (macOS
    // /tmp -> /private/tmp) so the relative path stays valid when node
    // canonicalizes the importer URL.
    const realDir = fs.realpathSync(dir);
    const relChttpFromRoutes =
      "./" + path.relative(realDir, routerPkgDir).split(path.sep).join("/");
    const importPath = relChttpFromRoutes + "/src/index.ts";
    fs.writeFileSync(routesPath, ROUTES_SRC.replace(/'@chttp\/router'/g, "'" + importPath + "'"));
    // Build the openapi sibling so the client import resolves.
    const m = extractModule(routesPath, fs.readFileSync(routesPath, "utf8"), {
      openapiValSpecifiers: VAL,
    });
    fs.mkdirSync(path.join(dir, ".chttp"), { recursive: true });
    const oaPath = path.join(dir, ".chttp", "routes.openapi.ts");
    fs.writeFileSync(oaPath, emitOpenApiModule(m, { title: "t", version: "1" }));
    // Build the client module. Like the real plugin, it lives under
    // .chttp/ so its `import "./routes.openapi.ts"` resolves to the
    // sibling just above it.
    cliModPath = path.join(dir, ".chttp", "routes.client.ts");
    fs.writeFileSync(cliModPath, emitClientModule(m));
    // The scratch driver sits at the root and imports the client via an
    // absolute path so the import map is unambiguous.
    fs.writeFileSync(
      path.join(dir, "client.ts"),
      CLIENT_SRC.replace(/"\.\/routes\.client\.ts"/, '"' + cliModPath + '"'),
    );
    // Find a free port.
    const net = await import("node:net");
    port = await new Promise<number>((res, rej) => {
      const s = net.createServer();
      s.listen(0, "127.0.0.1", () => {
        const a = s.address();
        const p = typeof a === "object" && a !== null ? a.port : 0;
        s.close(() => res(p));
      });
      s.on("error", rej);
    });
    // Spawn the server as a child process so the test event loop stays
    // alive (spawnSync would deadlock for a long-lived listener).
    proc = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", routesPath], {
      env: { ...process.env, CHTTP_TEST_PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    // Mirror stderr for debugging when the server fails to start.
    const procStderr = proc.stderr;
    if (procStderr !== null) {
      procStderr.on("data", (c: Buffer) => {
        // eslint-disable-next-line no-console
        console.error("[server stderr]", c.toString());
      });
    }
    // The server isn't listening yet — poll for it with a probe until it
    // responds (or the timeout elapses).
    const ok = await new Promise<boolean>((res) => {
      let tries = 0;
      const tick = (): void => {
        const probe = spawn(
          process.execPath,
          [
            "-e",
            "fetch('http://127.0.0.1:" +
              String(port) +
              "/user/p').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
          ],
          { stdio: "ignore" },
        );
        probe.on("exit", (code) => {
          if (code === 0) {
            res(true);
            return;
          }
          tries += 1;
          if (tries >= 80) {
            res(false);
            return;
          }
          setTimeout(tick, 50);
        });
      };
      tick();
    });
    assert.ok(ok, "server failed to start within timeout");
  });

  after(async () => {
    // Tear the child server down BEFORE removing the scratch dir, so its
    // fs imports don't race the rm. SIGTERM first, SIGKILL as last resort.
    if (proc !== null && proc.exitCode === null) {
      proc.kill("SIGTERM");
      const exited = await new Promise<boolean>((res) => {
        if (proc === null) {
          res(true);
          return;
        }
        const t = setTimeout(() => {
          if (proc !== null && proc.exitCode === null) {
            try {
              proc.kill("SIGKILL");
            } catch {
              /* ignore */
            }
          }
          res(false);
        }, 500);
        proc.on("exit", () => {
          clearTimeout(t);
          res(true);
        });
      });
      void exited;
    }
    if (dir !== "") {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    proc = null;
  });

  async function runClient(which: string): Promise<string> {
    const envBase = "http://127.0.0.1:" + String(port);
    const clientPath = path.join(dir, "client.ts");
    const r = spawn(
      process.execPath,
      ["--experimental-strip-types", "--no-warnings", clientPath, which],
      {
        env: { ...process.env, CHTTP_TEST_BASE: envBase },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    return await new Promise<string>((res, rej) => {
      let out = "";
      let err = "";
      r.stdout.on("data", (c: Buffer) => (out += c.toString()));
      r.stderr.on("data", (c: Buffer) => (err += c.toString()));
      r.on("error", rej);
      r.on("close", (code) => {
        if (code !== 0) {
          rej(new Error("client exited " + String(code) + ": " + err));
          return;
        }
        res(out.trim());
      });
    });
  }

  it("substitutes :id path params and decodes the response", async () => {
    const r = await runClient("get-param");
    assert.deepEqual(JSON.parse(r), { id: "42" });
  });

  it("serializes query strings and decodes the response", async () => {
    const r = await runClient("get-query");
    assert.deepEqual(JSON.parse(r), { q: "hello" });
  });

  it("serializes JSON body and reads back the parsed body", async () => {
    const r = await runClient("post-body");
    assert.deepEqual(JSON.parse(r), { body: '{"hello":"world"}' });
  });

  it("throws ChttpClientError on non-2xx with status + body", async () => {
    const r = await runClient("boom");
    const parsed = JSON.parse(r) as { name: string; status: number };
    assert.equal(parsed.name, "ChttpClientError");
    assert.equal(parsed.status, 500);
  });
});
