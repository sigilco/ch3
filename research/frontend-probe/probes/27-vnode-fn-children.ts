type Comp = (name: string) => VNode;

interface VNode {
  type: string | Comp;
  props: string;
  children: VNode[];
}

function Hello(name: string): VNode {
  return { type: "h1", props: name, children: [] };
}

function render(n: VNode): string {
  if (typeof n.type === "function") {
    return render(n.type(n.props));
  }
  let inner = n.props;
  for (let i = 0; i < n.children.length; i++) {
    inner = inner + render(n.children[i]);
  }
  return "<" + n.type + ">" + inner + "</" + n.type + ">";
}

const tree: VNode = {
  type: Hello,
  props: "Ada",
  children: [],
};
console.log(render(tree));
