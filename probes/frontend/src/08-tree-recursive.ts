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

function render(el: El): string {
  let inner = el.text.split("<").join("&lt;");
  const kids = el.kids;
  for (let i = 0; i < kids.length; i++) {
    inner += render(kids[i]);
  }
  return "<" + el.tag + ">" + inner + "</" + el.tag + ">";
}

const tree = new El("div", "", [new El("p", "a<b>", [])]);
const html = render(tree);
if (html !== "<div><p>a&lt;b></p></div>") {
  console.log("FAIL tree-recursive " + html);
  process.exit(1);
}
console.log("PASS tree-recursive");
