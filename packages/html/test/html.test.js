// Unit tests for @chttp/html: runs on the tsc build (node --test).
// The same src compiles to ELF via scriptc; see bench/apps/chttp-html.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as Html from "../dist/esm/index.js";

const { BARE, Fragment, createElement, escapeHtml, h, html, raw } = Html;

test("escapeHtml escapes & < \" ' and leaves > alone (kita bytes)", () => {
  assert.equal(escapeHtml(`<b>"x" & 'y'</b>`), "&lt;b>&#34;x&#34; &amp; &#39;y&#39;&lt;/b>");
  assert.equal(escapeHtml(""), "");
  assert.equal(escapeHtml("plain"), "plain");
  assert.equal(escapeHtml("&"), "&amp;");
  assert.equal(escapeHtml("a&b&c"), "a&amp;b&amp;c");
  assert.equal(escapeHtml("tail<"), "tail&lt;");
  assert.equal(escapeHtml("héllo ☃ 😀"), "héllo ☃ 😀");
});

test("XSS payloads are neutralised in text and attributes", () => {
  const payloads = [
    "<script>alert(1)</script>",
    `"><img src=x onerror=alert(1)>`,
    `' onmouseover='alert(1)`,
    `</textarea><script>alert(1)</script>`,
    `javascript:alert(1)`,
    `<svg/onload=alert(1)>`,
    `&lt;script&gt;`,
  ];
  for (const p of payloads) {
    const text = html`<p>${p}</p>`;
    assert.equal(text.includes("<script"), false, p);
    assert.equal(text.includes("<img"), false, p);
    assert.equal(text.includes("<svg"), false, p);
    const el = h("a", ["href", p, "title", p], [escapeHtml(p)]);
    assert.equal(el.split('"').length - 1, 4, p);
    assert.equal(/<[a-z]/i.test(el.slice(3)), false, p);
    assert.equal(h("p", ["safe", "true"], [p]).includes("<script"), false, p);
  }
  assert.equal(html`<p>${"&lt;"}</p>`, "<p>&amp;lt;</p>");
});

test("h renders attributes, void elements, boolean attrs and the safe pair", () => {
  assert.equal(h("div", [], []), "<div></div>");
  assert.equal(h("br", [], []), "<br/>");
  assert.equal(h("img", ["src", "a.png", "alt", ""], []), '<img src="a.png" alt=""/>');
  assert.equal(
    h("input", ["disabled", BARE, "value", 'a"b'], []),
    '<input disabled value="a&#34;b"/>',
  );
  assert.equal(h("p", [], ["a", "b"]), "<p>ab</p>");
  assert.equal(h("p", ["safe", "true"], ["<i>"]), "<p>&lt;i></p>");
  assert.equal(h("p", ["safe", "false"], ["<i>"]), "<p><i></p>");
  assert.equal(h("p", ["id", "x", "safe", "true"], ["<i>"]), '<p id="x">&lt;i></p>');
  assert.equal(h("p", ["id"], []), "<p></p>");
  assert.equal(
    h("ul", [], [h("li", [], ["1"]), h("li", [], ["2"])]),
    "<ul><li>1</li><li>2</li></ul>",
  );
  for (const v of [
    "meta",
    "link",
    "hr",
    "area",
    "base",
    "col",
    "command",
    "embed",
    "keygen",
    "param",
    "source",
    "track",
    "wbr",
  ]) {
    assert.equal(h(v, [], []), `<${v}/>`);
  }
  assert.equal(
    h("custom-el", ["@click", "go()", "hx-on:click", "x", "data-a.b", "1"], []),
    '<custom-el @click="go()" hx-on:click="x" data-a.b="1"></custom-el>',
  );
});

test("tag and attribute names are validated", () => {
  const bad = ["", "1a", "a b", "a>", "a/", "a=", 'a"', "a\n", "<script", "a_b"];
  for (const t of bad) {
    assert.throws(() => h(t, [], []), /invalid tag name/, JSON.stringify(t));
  }
  const badAttr = ["", "1a", "a b", "a>", "a=b", 'a"', "a/", "a\u0000", " onload", "a b=c d"];
  for (const a of badAttr) {
    assert.throws(() => h("div", [a, "x"], []), /invalid attribute name/, JSON.stringify(a));
  }
  assert.doesNotThrow(() => h("div", ["_a", "1", ":b", "2", "@c", "3", "d1", "4"], []));
  assert.throws(() => h("div", ["x$", "1"], []));
});

test("html and raw tags", () => {
  assert.equal(html`<p>${"<b>"}</p>`, "<p>&lt;b></p>");
  assert.equal(html`a${"1"}b${"2"}c`, "a1b2c");
  assert.equal(html`static`, "static");
  assert.equal(html`${"<"}`, "&lt;");
  assert.equal(raw`<p>${"<b>"}</p>`, "<p><b></p>");
  assert.equal(raw`x`, "x");
  // Nested markup composes through raw, and text through html.
  assert.equal(raw`<div>${html`<i>${"<"}</i>`}</div>`, "<div><i>&lt;</i></div>");
});

test("createElement, Fragment and components", () => {
  assert.equal(createElement("p", ["id", "a"], "x", "y"), '<p id="a">xy</p>');
  assert.equal(createElement("br", []), "<br/>");
  assert.equal(Fragment([h("b", [], []), "t"]), "<b></b>t");
  assert.equal(Fragment([]), "");
  const Card = (props) => h("div", ["class", "card"], [escapeHtml(props.title), props.body]);
  assert.equal(Card({ title: "<t>", body: "<p>b</p>" }), '<div class="card">&lt;t><p>b</p></div>');
  assert.equal(Html.isVoidElement("br"), true);
  assert.equal(Html.isVoidElement("div"), false);
  assert.equal(Html.isValidTag("h1"), true);
  assert.equal(Html.isValidAttrName("a-b"), true);
});

// Footgun tests: these pin the documented escaping model (see docs/html.md "Escaping footguns").
test("footgun: string children are markup, h does not escape them", () => {
  const evil = "<script>alert(1)</script>";
  assert.equal(h("p", [], [evil]), `<p>${evil}</p>`);
  assert.equal(h("p", [], [escapeHtml(evil)]), "<p>&lt;script>alert(1)&lt;/script></p>");
  assert.equal(h("p", ["safe", "true"], [evil]), "<p>&lt;script>alert(1)&lt;/script></p>");
  assert.equal(createElement("p", [], evil), `<p>${evil}</p>`);
  assert.equal(Fragment([evil]), evil);
});

test("footgun: safe escapes joined kids, so it also escapes nested markup", () => {
  const nested = h("b", [], ["bold"]);
  assert.equal(h("p", ["safe", "true"], [nested]), "<p>&lt;b>bold&lt;/b></p>");
  assert.equal(h("p", ["safe", "false"], [nested]), "<p><b>bold</b></p>");
});

test("footgun: escaping is not URL validation, javascript: hrefs pass through", () => {
  assert.equal(
    h("a", ["href", "javascript:alert(1)"], ["x"]),
    '<a href="javascript:alert(1)">x</a>',
  );
  assert.equal(
    h("a", ["href", "JaVaScRiPt:alert(1)"], ["x"]),
    '<a href="JaVaScRiPt:alert(1)">x</a>',
  );
  assert.equal(
    h("a", ["href", "data:text/html,<script>1</script>"], ["x"]),
    '<a href="data:text/html,&lt;script>1&lt;/script>">x</a>',
  );
  assert.equal(h("img", ["src", "javascript:alert(1)"], []), '<img src="javascript:alert(1)"/>');
});

test("footgun: attribute values are always quoted and escaped, breakout fails", () => {
  const out = h("div", ["title", `" onclick="alert(1)`], []);
  assert.equal(out, '<div title="&#34; onclick=&#34;alert(1)"></div>');
  const single = h("div", ["title", `' onclick='alert(1)`], []);
  assert.equal(single, '<div title="&#39; onclick=&#39;alert(1)"></div>');
  assert.equal(h("div", ["title", "a>b"], []), '<div title="a>b"></div>');
});

test("footgun: attribute names and tags are validated, user keys cannot inject", () => {
  assert.throws(() => h("div", [`x" onclick="alert(1)`, "1"], []), /invalid attribute name/);
  assert.throws(() => h("div", ["a b", "1"], []), /invalid attribute name/);
  assert.throws(() => h("div", ["", "1"], []), /invalid attribute name/);
  assert.throws(() => h("script><img", [], []), /invalid tag name/);
  assert.throws(() => h("", [], []), /invalid tag name/);
});

test("footgun: the BARE sentinel as a value emits a bare attribute", () => {
  assert.equal(h("input", ["disabled", BARE], []), "<input disabled/>");
  assert.equal(h("input", ["value", "\u0000"], []), "<input value/>");
});

test("footgun: raw and static template text are trusted, only interpolations escape", () => {
  const evil = "<img src=x onerror=alert(1)>";
  assert.equal(raw`<p>${evil}</p>`, `<p>${evil}</p>`);
  assert.equal(html`<p>${evil}</p>`, "<p>&lt;img src=x onerror=alert(1)></p>");
  assert.equal(html`${evil}`, "&lt;img src=x onerror=alert(1)>");
  assert.equal(html`<b>static</b>`, "<b>static</b>");
});

test("footgun: nested html output is escaped again, compose with raw or h instead", () => {
  const inner = html`<b>${"x"}</b>`;
  assert.equal(html`<p>${inner}</p>`, "<p>&lt;b>x&lt;/b></p>");
  assert.equal(raw`<p>${inner}</p>`, "<p><b>x</b></p>");
  assert.equal(h("p", [], [inner]), "<p><b>x</b></p>");
});

test("footgun: escapeHtml is not idempotent, double escaping corrupts entities", () => {
  assert.equal(escapeHtml(escapeHtml("<")), "&amp;lt;");
  assert.equal(escapeHtml("&amp;"), "&amp;amp;");
});

test("footgun: escapeHtml is for HTML text and quoted attributes only", () => {
  // Backticks and = are untouched: unsafe in unquoted attributes or script/style contexts.
  assert.equal(escapeHtml("`a=b`"), "`a=b`");
  assert.equal(
    h("script", [], [escapeHtml("</script><b>")]),
    "<script>&lt;/script>&lt;b></script>",
  );
});
