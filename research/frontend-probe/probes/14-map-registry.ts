type Comp = (name: string) => string;

function hello(name: string): string {
  return "<p>" + name + "</p>";
}

const registry: Map<string, Comp> = new Map();
registry.set("hello", hello);
const fn = registry.get("hello");
if (fn) {
  console.log(fn("Ada"));
}
