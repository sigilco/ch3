interface VNode {
  tag: string;
  body: string;
  children: VNode[];
}

function render(n: VNode): string {
  let inner = n.body;
  for (let i = 0; i < n.children.length; i++) {
    inner = inner + render(n.children[i]);
  }
  return "<" + n.tag + ">" + inner + "</" + n.tag + ">";
}

const leaf: VNode = { tag: "em", body: "Ada", children: [] };
const tree: VNode = { tag: "h1", body: "", children: [leaf] };
console.log(render(tree));
