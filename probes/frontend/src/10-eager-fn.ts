class El {
  tag: string;
  text: string;
  kids: El[];

  constructor(tag: string, text: string, kids: El[]) {
    this.tag = tag;
    this.text = text;
    this.kids = kids;
  }
}

function h(tag: string, text: string, kids: El[]): El {
  return new El(tag, text, kids);
}

function button(label: string): El {
  return h("button", label, []);
}

function render(el: El): string {
  let inner = el.text.split("<").join("&lt;");
  for (let i = 0; i < el.kids.length; i++) {
    inner += render(el.kids[i]);
  }
  return "<" + el.tag + ">" + inner + "</" + el.tag + ">";
}

const tree = h("div", "", [button("a<b>")]);
const html = render(tree);
if (html !== "<div><button>a&lt;b></button></div>") {
  console.log("FAIL eager-fn " + html);
  process.exit(1);
}
console.log("PASS eager-fn");
