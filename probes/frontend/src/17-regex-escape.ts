const RE = /[&<>"']/g;

function esc(s: string): string {
  return String(s).replace(RE, function (ch: string): string {
    if (ch === "&") {
      return "&amp;";
    }
    if (ch === "<") {
      return "&lt;";
    }
    if (ch === ">") {
      return "&gt;";
    }
    if (ch === '"') {
      return "&quot;";
    }
    return "&#39;";
  });
}

const html = esc("a<b>&\"'");
if (html !== "a&lt;b&gt;&amp;&quot;&#39;") {
  console.log("FAIL regex " + html);
  process.exit(1);
}
console.log("PASS regex-escape");
