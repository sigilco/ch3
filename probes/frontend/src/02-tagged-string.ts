function esc(s: string): string {
  return String(s).split("&").join("&amp;").split("<").join("&lt;");
}

function html(strings: TemplateStringsArray, ...values: string[]): string {
  let out = "";
  for (let i = 0; i < strings.length; i++) {
    out += String(strings[i]);
    if (i < values.length) {
      out += esc(String(values[i]));
    }
  }
  return out;
}

const name = "a<b>";
const page = html`<p>${name}</p>`;
if (page !== "<p>a&lt;b></p>") {
  console.log("FAIL tagged " + page);
  process.exit(1);
}
console.log("PASS tagged-string");
