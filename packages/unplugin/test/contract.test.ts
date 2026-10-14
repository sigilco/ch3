import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ROUTE_CONTRACT_VERSION as CHTTP_VERSION } from "@chttp/router";
import { ROUTE_CONTRACT_VERSION as UNPLUGIN_VERSION } from "../src/contract.ts";
import { getParser } from "../src/parse/index.ts";
import { extractModule } from "../src/extract.ts";
import { emitGenModule } from "../src/emit.ts";

describe("contract version", () => {
  it("unplugin constant equals the chttp runtime export", () => {
    assert.equal(typeof CHTTP_VERSION, "number");
    assert.equal(UNPLUGIN_VERSION, CHTTP_VERSION);
  });

  it("stamps the version into the generated module header", () => {
    const g = emitGenModule(
      extractModule(
        "/app/src/routes.chttp.ts",
        `import { createRouter } from '@chttp/router'
export const app = createRouter()
app.get('/a', (c) => c.text('a'))
`,
      ),
      { importFrom: "@chttp/router", modulePath: "/app/src/routes.chttp.ts" },
    );
    assert.match(
      g,
      new RegExp("^export const ROUTE_CONTRACT_VERSION = " + String(CHTTP_VERSION) + ";$", "m"),
    );
    // the dispatch instance carries the same stamp for withDispatch to check
    assert.match(
      g,
      new RegExp("^\\s*ROUTE_CONTRACT_VERSION = " + String(CHTTP_VERSION) + "$", "m"),
    );
  });
});

describe("parser registry", () => {
  it("defaults to classic", () => {
    assert.equal(getParser().k.TrueKeyword, getParser("classic").k.TrueKeyword);
  });
  it("throws on an unknown parser name", () => {
    assert.throws(() => getParser("nope"), /unknown parser 'nope'/);
  });
});
