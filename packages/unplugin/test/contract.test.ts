import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ROUTE_CONTRACT_VERSION as CH3_VERSION } from "ch3";
import { ROUTE_CONTRACT_VERSION as UNPLUGIN_VERSION } from "../src/contract.ts";
import { getParser } from "../src/parse/index.ts";
import { extractModule } from "../src/extract.ts";
import { emitGenModule } from "../src/emit.ts";

describe("contract version", () => {
  it("unplugin constant equals the ch3 runtime export", () => {
    assert.equal(typeof CH3_VERSION, "number");
    assert.equal(UNPLUGIN_VERSION, CH3_VERSION);
  });

  it("stamps the version into the generated module header", () => {
    const g = emitGenModule(
      extractModule(
        "/app/src/routes.ch3.ts",
        `import { createRouter } from 'ch3'
export const app = createRouter()
app.get('/a', (c) => c.text('a'))
`,
      ),
      { importFrom: "ch3", modulePath: "/app/src/routes.ch3.ts" },
    );
    assert.match(
      g,
      new RegExp("^export const ROUTE_CONTRACT_VERSION = " + String(CH3_VERSION) + ";$", "m"),
    );
    // the dispatch instance carries the same stamp for withDispatch to check
    assert.match(g, new RegExp("^\\s*ROUTE_CONTRACT_VERSION = " + String(CH3_VERSION) + "$", "m"));
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
