interface VNode {
  tag: string;
  body: string;
}

function render(n: VNode): string {
  return "<" + n.tag + ">" + n.body + "</" + n.tag + ">";
}

const n: VNode = { tag: "h1", body: "Ada" };
console.log(render(n));
