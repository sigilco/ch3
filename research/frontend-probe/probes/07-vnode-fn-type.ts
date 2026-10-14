type Comp = (name: string) => string;

interface VNode {
  type: Comp;
  props: string;
}

function hello(name: string): string {
  return "<h1>" + name + "</h1>";
}

const n: VNode = { type: hello, props: "Ada" };
console.log(n.type(n.props));
