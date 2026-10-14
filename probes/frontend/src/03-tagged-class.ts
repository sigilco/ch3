class Html {
  s: string;
  constructor(s: string) {
    this.s = s;
  }
}

function t(s: string): Html {
  return new Html(String(s).split("<").join("&lt;"));
}

function html(strings: TemplateStringsArray, ...values: Html[]): Html {
  let out = "";
  for (let i = 0; i < strings.length; i++) {
    out += String(strings[i]);
    if (i < values.length) {
      out += values[i].s;
    }
  }
  return new Html(out);
}

const page = html`<p>${t("a<b")}</p>`;
if (page.s !== "<p>a&lt;b</p>") {
  console.log("FAIL tagged-class " + page.s);
  process.exit(1);
}
console.log("PASS tagged-class");
