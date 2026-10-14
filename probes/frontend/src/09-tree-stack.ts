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

class Frame {
  el: El;
  phase: number;
  nextKid: number;

  constructor(el: El) {
    this.el = el;
    this.phase = 0;
    this.nextKid = 0;
  }
}

function render(root: El): string {
  const stack: Frame[] = [];
  stack.push(new Frame(root));
  let out = "";
  while (stack.length > 0) {
    const fr = stack[stack.length - 1];
    const el = fr.el;
    if (fr.phase === 0) {
      out += "<" + el.tag + ">" + el.text.split("<").join("&lt;");
      fr.phase = 1;
    }
    if (fr.nextKid < el.kids.length) {
      const kid = el.kids[fr.nextKid];
      fr.nextKid = fr.nextKid + 1;
      stack.push(new Frame(kid));
    } else {
      out += "</" + el.tag + ">";
      stack.pop();
    }
  }
  return out;
}

const tree = new El("div", "", [new El("p", "a<b>", []), new El("span", "c", [])]);
const html = render(tree);
if (html !== "<div><p>a&lt;b></p><span>c</span></div>") {
  console.log("FAIL tree-stack " + html);
  process.exit(1);
}
console.log("PASS tree-stack");
