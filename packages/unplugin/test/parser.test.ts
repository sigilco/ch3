import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getParser, tsgoAvailable } from "../src/parse/index.ts";
import { extractModule } from "../src/extract.ts";

const SRC_BASIC = `
import { createRouter } from '@chttp/router'
export const app = createRouter()
app.get('/json', (c) => c.json({ hello: 'world' }))
app.get('/user/:id', (c) => c.json({ id: c.req.param('id') }))
app.post('/echo', (c) => c.text(c.req.body()), { body: true })
`;

describe("parser registry", () => {
  it("returns classic by default", () => {
    const p = getParser();
    assert.equal(getParser(undefined), p, "caches one instance");
    assert.equal(getParser(""), p, "empty string means classic");
    const ctor = Object.getPrototypeOf(p).constructor;
    assert.equal(ctor.name, "ClassicParser");
  });

  it("throws on unknown parser names", () => {
    assert.throws(
      () => getParser("nonsense"),
      /unknown parser 'nonsense' \(available: classic, tsgo\)/,
    );
  });

  it("registers tsgo without requiring the nightly", () => {
    // Resolving the entry must not load or spawn anything: on classic-only
    // installs the parser object still constructs, it just fails to parse.
    const p = getParser("tsgo");
    assert.equal(Object.getPrototypeOf(p).constructor.name, "TsgoParser");
  });
});

describe("tsgo integration", { skip: !tsgoAvailable() }, () => {
  it("extracts the same module model as classic", () => {
    const classic = extractModule("routes.chttp.ts", SRC_BASIC, { parser: "classic" });
    const tsgo = extractModule("routes.chttp.ts", SRC_BASIC, { parser: "tsgo" });
    assert.equal(tsgo.fatal, "");
    assert.deepEqual(
      tsgo.routes.map((r) => r.method + " " + r.path + " idx=" + r.handlerIdx),
      classic.routes.map((r) => r.method + " " + r.path + " idx=" + r.handlerIdx),
    );
    // literal send specialization works through remote nodes too
    assert.equal(tsgo.routes[0].staticSend?.body, classic.routes[0].staticSend?.body);
    assert.equal(tsgo.routes[2].needsBody, true);
  });

  it("warns with the tsgo-computed line on bailed registrations", () => {
    const warns = extractModule(
      "routes.chttp.ts",
      "import { createRouter } from '@chttp/router'\nexport const app = createRouter()\nconst dyn = '/d'\napp.get(dyn, (c) => c.text('x'))\n",
      { parser: "tsgo" },
    );
    assert.ok(
      warns.warnings.some((w) => w.includes("routes.chttp.ts:4 ")),
      warns.warnings.join("\n"),
    );
  });
});
