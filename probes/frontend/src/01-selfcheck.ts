import { cat, el, esc, raw, text } from "./lib/html.ts";
import { countPage } from "./lib/page.ts";

function assertEq(got: string, want: string, label: string): void {
  if (got !== want) {
    console.log("FAIL " + label + " got=" + got);
    process.exit(1);
  }
}

assertEq(esc("a<b>&\"'"), "a&lt;b&gt;&amp;&quot;&#39;", "esc");
assertEq(esc(""), "", "esc-empty");
assertEq(el("p", text("a<b>")).s, "<p>a&lt;b&gt;</p>", "el");
assertEq(raw("<b>x</b>").s, "<b>x</b>", "raw");
assertEq(cat([text("a"), raw("<i>"), text("<")]).s, "a<i>&lt;", "cat");

const page = countPage("A<B>").s;
if (page.indexOf("<h1>Hello A&lt;B&gt;</h1>") < 0) {
  console.log("FAIL page-escape");
  process.exit(1);
}
if (page.indexOf('data-user="A&lt;B&gt;"') < 0) {
  console.log("FAIL attr-escape");
  process.exit(1);
}
if (page.indexOf('fetch("/api/count")') < 0) {
  console.log("FAIL island");
  process.exit(1);
}
console.log("PASS selfcheck");
