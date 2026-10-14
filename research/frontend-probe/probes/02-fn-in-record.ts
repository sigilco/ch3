type Comp = (name: string) => string;

const registry: { hello: Comp } = {
  hello: function (name: string): string {
    return "<p>" + name + "</p>";
  },
};

console.log(registry.hello("Ada"));
