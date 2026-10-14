// The node-only jsx runtime must render identically to h() for the same tree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BARE, escapeHtml, h, Fragment as frag } from "../dist/esm/index.js";
import { Fragment, jsx, jsxDEV, jsxs } from "../dist/esm/jsx-runtime.js";

test("jsx output is identical to h() for the same tree", () => {
  const viaJsx = jsx("html", {
    lang: "en",
    children: [
      jsx("head", { children: jsx("meta", { charset: "utf-8" }) }),
      jsxs("body", {
        className: "page",
        children: [
          jsx("h1", { children: "Hi" }),
          jsx("input", { disabled: true, value: 'a"b', tabindex: 3 }),
          jsx("p", { safe: true, children: "<i>x</i>" }),
          jsx("br", {}),
          jsxs("ul", { children: [1, 2].map((n) => jsx("li", { children: n })) }),
        ],
      }),
    ],
  });
  const viaH = h(
    "html",
    ["lang", "en"],
    [
      h("head", [], [h("meta", ["charset", "utf-8"], [])]),
      h(
        "body",
        ["class", "page"],
        [
          h("h1", [], ["Hi"]),
          h("input", ["disabled", BARE, "value", 'a"b', "tabindex", "3"], []),
          h("p", ["safe", "true"], ["<i>x</i>"]),
          h("br", [], []),
          h("ul", [], [h("li", [], ["1"]), h("li", [], ["2"])]),
        ],
      ),
    ],
  );
  assert.equal(viaJsx, viaH);
  assert.equal(jsxDEV, jsx);
});

test("components, fragments, skipped values and escaping", () => {
  const Card = (p) => jsx("div", { class: "card", children: [escapeHtml(p.title), p.children] });
  assert.equal(
    jsx(Card, { title: "<t>", children: jsx("b", { children: "x" }) }),
    '<div class="card">&lt;t><b>x</b></div>',
  );
  assert.equal(
    Fragment({ children: [jsx("b", {}), null, undefined, false, true, "t", ["u", 4]] }),
    frag(["<b></b>", "t", "u", "4"]),
  );
  assert.equal(jsx("p", { key: "k", hidden: false, title: null, children: undefined }), "<p></p>");
  assert.equal(jsx("p", { safe: false }), "<p></p>");
  assert.equal(jsx("p", { safe: true, children: "<s>" }), "<p>&lt;s></p>");
  assert.throws(() => jsx("a b", {}), /invalid tag name/);
  assert.throws(() => jsx("a", { "x y": "1" }), /invalid attribute name/);
});
