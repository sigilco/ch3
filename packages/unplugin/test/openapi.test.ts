// Golden tests for the OpenAPI side channel (routes.openapi.ts): detection
// evidence per route shape, emitted module text, and — for one emitted
// module — a real evaluation against @chttp/val. The gen-file emission is
// exercised for byte-identity with the option on vs off.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { extractModule } from "../src/extract.ts";
import { emitGenModule } from "../src/emit.ts";
import { emitOpenApiModule, openApiFileName } from "../src/openapi.ts";

const VAL = ["@chttp/val"];

const mod = (src: string) =>
  extractModule("/app/src/routes.chttp.ts", src, {
    openapiValSpecifiers: VAL,
  });

// One emitted module really imports @chttp/val (the workspace link resolves
// to the package's built dist, as in a consumer install) and evaluates its
// document at import time.
const evalDoc = async (src: string): Promise<unknown> => {
  // The scratch module lives in /tmp but node must resolve '@chttp/val'
  // through the workspace: resolve the real directory of the val package
  // and symlink it into the scratch node_modules, mirroring an install.
  const valUrl = new URL(import.meta.resolve("@chttp/val/package.json"));
  const valDir = path.dirname(fileURLToPath(valUrl));
  const dir = "/tmp/unplugin-chttp-oa-test";
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir + "/.chttp", { recursive: true });
  fs.mkdirSync(dir + "/node_modules/@chttp", { recursive: true });
  await fs.promises.symlink(valDir, dir + "/node_modules/@chttp/val", "dir").catch(() => undefined);
  const modPath = dir + "/routes.chttp.ts";
  fs.writeFileSync(modPath, src);
  const m = extractModule(modPath, src, { openapiValSpecifiers: VAL });
  const oaPath = dir + "/.chttp/routes.openapi.ts";
  fs.writeFileSync(oaPath, emitOpenApiModule(m, { title: "t", version: "1" }));
  const oa = (await import(oaPath)) as { openapiDocument: unknown };
  return oa.openapiDocument;
};

describe("detectOpenApi", () => {
  it("binds a module-level schema parsed from the body to requestBody evidence", () => {
    const m = mod(`
import { createRouter } from '@chttp/router'
import * as v from '@chttp/val'
export const app = createRouter()
const EchoIn = v.object({ msg: v.string() })
app.post('/echo', (c) => { v.parse(EchoIn, JSON.parse(c.req.body())); return c.json({ ok: true }) }, { body: true })
`);
    assert.equal(m.openapi.length, 1);
    assert.equal(m.openapi[0].target, "body");
    assert.equal(m.openapi[0].schemaSrc, "EchoIn");
    assert.equal(m.openapi[0].valSpecifier, "@chttp/val");
    assert.deepEqual(m.openapi[0].deps, ["EchoIn"]);
    assert.equal(m.openapiWarnings.length, 0);
  });

  it("recognizes query targets (query and queryAll)", () => {
    const m = mod(`
import { createRouter } from '@chttp/router'
import * as v from '@chttp/val'
export const app = createRouter()
const Q = v.object({ x: v.string() })
const QA = v.object({ y: v.string() })
app.get('/q', (c) => { v.parse(Q, c.req.query('x')); return c.text('q') })
app.get('/qa', (c) => { v.parse(QA, c.req.queryAll()); return c.text('qa') })
`);
    assert.deepEqual(
      m.openapi.map((e) => e.target),
      ["query", "query"],
    );
    assert.deepEqual(
      m.openapi.map((e) => e.path),
      ["/q", "/qa"],
    );
  });

  it("recognizes param targets", () => {
    const m = mod(`
import { createRouter } from '@chttp/router'
import * as v from '@chttp/val'
export const app = createRouter()
const P = v.object({ id: v.string() })
app.get('/u/:id', (c) => { v.parse(P, c.req.param('id')); return c.text('u') })
`);
    assert.equal(m.openapi.length, 1);
    assert.equal(m.openapi[0].target, "params");
  });

  it("warns and skips an unresolvable schema, documenting the route without it", () => {
    const m = mod(`
import { createRouter } from '@chttp/router'
import * as v from '@chttp/val'
export const app = createRouter()
app.post('/d', (c) => { v.parse(getSchema(), JSON.parse(c.req.body())); return c.text('d') })
`);
    assert.equal(m.openapi.length, 0);
    assert.equal(m.openapiWarnings.length, 1);
    assert.match(m.openapiWarnings[0] as string, /not statically resolvable/);
    // the route itself still documents as a plain operation
    const out = emitOpenApiModule(m, { title: "t", version: "1" });
    assert.match(out, /"\/d"/);
    assert.doesNotMatch(out, /requestBody/);
  });

  it("attaches no evidence and no warnings to routes without val", () => {
    const m = mod(`
import { createRouter } from '@chttp/router'
export const app = createRouter()
app.get('/plain', (c) => c.text('plain'))
`);
    assert.equal(m.openapi.length, 0);
    assert.equal(m.openapiWarnings.length, 0);
    const out = emitOpenApiModule(m, { title: "t", version: "1" });
    assert.match(out, /No statically provable val schemas/);
  });

  it("never matches a foreign context parameter", () => {
    const m = mod(`
import { createRouter } from '@chttp/router'
import * as v from '@chttp/val'
export const app = createRouter()
const S = v.object({ a: v.string() })
app.get('/x', (c) => {
  return function (other: unknown) { return v.parse(S, (other as { req: { body(): string } }).req.body()) }
})
`);
    assert.equal(m.openapi.length, 0);
  });

  it("collects const-to-const schema references with their dependency", () => {
    const m = mod(`
import { createRouter } from '@chttp/router'
import * as v from '@chttp/val'
export const app = createRouter()
const Item = v.object({ sku: v.string() })
const Items = v.array(Item)
app.post('/cart', (c) => { v.parse(Items, JSON.parse(c.req.body())); return c.json({ n: 1 }) })
`);
    assert.equal(m.openapi.length, 1);
    assert.equal(m.openapi[0].schemaSrc, "Items");
    assert.deepEqual(m.openapi[0].deps, ["Item", "Items"]);
    // both consts captured, in declaration order
    assert.deepEqual(
      m.openapiConsts.map((c) => c.name),
      ["Item", "Items"],
    );
    assert.equal(m.openapiConsts[0]?.src, "val.object({sku: val.string()})");
    assert.equal(m.openapiConsts[1]?.src, "val.array(Item)");
  });

  it("refuses const names the emitter reserves (collision-proof scheme)", () => {
    const m = mod(`
import { createRouter } from '@chttp/router'
import * as v from '@chttp/val'
export const app = createRouter()
const __chttpNodes = v.object({ b: v.string() })
app.post('/y', (c) => { v.parse(__chttpNodes, c.req.body()); return c.text('y') })
`);
    assert.equal(m.openapi.length, 0);
    assert.equal(m.openapiWarnings.length, 1);
    assert.equal(m.openapiConsts.length, 0);
  });
});

describe("emitOpenApiModule", () => {
  it("emits requestBody for a body target with the schema re-declared first", () => {
    const m = mod(`
import { createRouter } from '@chttp/router'
import * as v from '@chttp/val'
export const app = createRouter()
const EchoIn = v.object({ msg: v.string() })
app.post('/echo', (c) => { v.parse(EchoIn, JSON.parse(c.req.body())); return c.json({ ok: true }) }, { body: true })
`);
    const out = emitOpenApiModule(m, { title: "api", version: "9.9.9" });
    assert.match(out, /^import \{ toOpenApiSchema \} from "@chttp\/val";$/m);
    assert.match(out, /^import \* as val from "@chttp\/val";$/m);
    assert.match(out, /^const EchoIn = val\.object\(\{msg: val\.string\(\)\}\);$/m);
    assert.match(out, /"application\/json": \{ schema: __chttpNodes\["__chttpSchema_0"\] \}/);
    assert.match(out, /requestBody: \{/);
    assert.match(out, /openapi: "3\.1\.0"/);
    assert.match(out, /info: \{ title: "api", version: "9\.9\.9" \}/);
  });

  it("emits consts in dependency order for const-to-const references", () => {
    const m = mod(`
import { createRouter } from '@chttp/router'
import * as v from '@chttp/val'
export const app = createRouter()
const Item = v.object({ sku: v.string() })
const Items = v.array(Item)
app.post('/cart', (c) => { v.parse(Items, JSON.parse(c.req.body())); return c.json({ n: 1 }) })
`);
    const out = emitOpenApiModule(m, { title: "t", version: "1" });
    const iItem = out.indexOf("const Item = ");
    const iItems = out.indexOf("const Items = ");
    assert.ok(iItem >= 0 && iItems > iItem, "dependency declared before dependent");
    assert.match(out, /toOpenApiSchema\(Items\)/);
  });

  it("splices query parameters from the schema object", () => {
    const m = mod(`
import { createRouter } from '@chttp/router'
import * as v from '@chttp/val'
export const app = createRouter()
const Q = v.object({ x: v.string(), n: v.optional(v.number()) })
app.get('/q', (c) => { v.parse(Q, c.req.query('x')); return c.text('q') })
`);
    const out = emitOpenApiModule(m, { title: "t", version: "1" });
    assert.match(out, /const __chttpQuery_0 = __queryParams\(__chttpNodes\["__chttpSchema_0"\]\);/);
    assert.match(out, /parameters: \[\.\.\.__chttpQuery_0\]/);
  });

  it("documents :param segments as path parameters", () => {
    const m = mod(`
import { createRouter } from '@chttp/router'
export const app = createRouter()
app.get('/u/:id', (c) => c.text('u'))
`);
    const out = emitOpenApiModule(m, { title: "t", version: "1" });
    assert.match(out, /"\/u\/\{id\}"/);
    assert.match(out, /\{ name: "id", in: "path", required: true \}/);
  });

  it("keeps a fixed file name and lists all-routes in the passthrough table", () => {
    assert.equal(openApiFileName(), "routes.openapi.ts");
    const m = mod(`
import { createRouter } from '@chttp/router'
export const app = createRouter()
app.all('/any', (c) => c.text('any'))
app.get('/g', (c) => c.text('g'))
`);
    const out = emitOpenApiModule(m, { title: "t", version: "1" });
    assert.doesNotMatch(out, /"\/any": \{/);
    assert.match(out, /"\*"/);
    assert.match(out, /\{ method: "\*", path: "\/any" \}/);
  });
});

describe("openapi side channel isolation", () => {
  const SRC = `
import { createRouter } from '@chttp/router'
import * as v from '@chttp/val'
export const app = createRouter()
const EchoIn = v.object({ msg: v.string() })
app.get('/json', (c) => c.json({ hello: 'world' }))
app.post('/echo', (c) => { v.parse(EchoIn, JSON.parse(c.req.body())); return c.json({ ok: true }) }, { body: true })
`;

  it("gen output is byte-identical with openapi on vs off", () => {
    const off = extractModule("/app/src/routes.chttp.ts", SRC, {
      openapiValSpecifiers: undefined,
    });
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

  it("evidence stays empty when the option is off", () => {
    const off = extractModule("/app/src/routes.chttp.ts", SRC, {});
    assert.equal(off.openapi.length, 0);
    assert.equal(off.openapiWarnings.length, 0);
    assert.equal(off.openapiConsts.length, 0);
  });

  it("emitted module evaluates against the real @chttp/val", async () => {
    const doc = (await evalDoc(`
import { createRouter } from '@chttp/router'
import * as v from '@chttp/val'
export const app = createRouter()
const Item = v.object({ sku: v.string() })
const Items = v.array(Item, )
app.post('/cart', (c) => { v.parse(Items, JSON.parse(c.req.body())); return c.json({ ok: true }) }, { body: true })
app.get('/q', (c) => { v.parse(v.object({ x: v.string() }), c.req.query('x')); return c.text('q') })
`)) as {
      openapi: string;
      info: { title: string; version: string };
      paths: Record<
        string,
        Record<
          string,
          {
            requestBody?: {
              content: {
                "application/json": {
                  schema: { type: string; items?: { type: string; items?: { type: string } } };
                };
              };
            };
            parameters?: {
              name: string;
              in: string;
              required: boolean;
              schema: { type: string };
            }[];
          }
        >
      >;
    };
    assert.equal(doc.openapi, "3.1.0");
    const cart = doc.paths["/cart"]?.post;
    const bodySchema = cart?.requestBody?.content["application/json"].schema;
    assert.ok(bodySchema, "cart requestBody schema present");
    assert.equal(bodySchema.type, "array");
    assert.equal(bodySchema.items?.type, "object"); // through the Item const
    const q = doc.paths["/q"]?.get;
    assert.ok(Array.isArray(q?.parameters));
    assert.equal(q?.parameters?.[0]?.name, "x");
    assert.equal(q?.parameters?.[0]?.in, "query");
    assert.equal(q?.parameters?.[0]?.schema.type, "string");
  });
});
