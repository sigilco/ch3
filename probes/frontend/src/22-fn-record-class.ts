type Node = {
  render: (s: string) => string;
};

class App {
  node: Node;

  constructor(node: Node) {
    this.node = node;
  }

  run(s: string): string {
    return this.node.render(s);
  }
}

const app = new App({
  render: function (s: string): string {
    return "<p>" + s.split("<").join("&lt;") + "</p>";
  },
});

const first = app.run("a<b");
const second = app.run("c<d");
if (first !== "<p>a&lt;b</p>" || second !== "<p>c&lt;d</p>") {
  console.log("FAIL fn-record-class " + first + " " + second);
  process.exit(1);
}
console.log("PASS fn-record-class");
