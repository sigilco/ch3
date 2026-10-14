type Comp = (name: string) => Node;

interface El {
  kind: number;
  tag: string;
  props: string;
  children: Node[];
  fn: Comp | null;
}

type Node = El;

function el(tag: string, props: string, children: Node[]): El {
  return { kind: 0, tag: tag, props: props, children: children, fn: null };
}

function comp(fn: Comp, props: string): El {
  return { kind: 1, tag: "", props: props, children: [], fn: fn };
}

function Hello(name: string): El {
  return el("h1", name, []);
}

function render(n: El): string {
  if (n.kind === 1) {
    const f = n.fn;
    if (f === null) {
      return "";
    }
    return render(f(n.props));
  }
  let inner = n.props;
  for (let i = 0; i < n.children.length; i++) {
    inner = inner + render(n.children[i]);
  }
  return "<" + n.tag + ">" + inner + "</" + n.tag + ">";
}

console.log(render(comp(Hello, "Ada")));
