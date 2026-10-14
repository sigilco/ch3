class Html {
  s: string;
  constructor(s: string) {
    this.s = s;
  }
}

function esc(s: string): string {
  return String(s).split("<").join("&lt;");
}

function html(strings: TemplateStringsArray, ...values: Array<Html | string>): Html {
  let out = "";
  for (let i = 0; i < strings.length; i++) {
    out += String(strings[i]);
    if (i < values.length) {
      const v = values[i];
      if (typeof v === "string") {
        out += esc(v);
      } else {
        out += v.s;
      }
    }
  }
  return new Html(out);
}

const trusted = new Html("<b>ok</b>");
const page = html`<p>${"<"} ${trusted}</p>`;
if (page.s !== "<p>&lt; <b>ok</b></p>") {
  console.log("FAIL tagged-union " + page.s);
  process.exit(1);
}
console.log("PASS tagged-union");
