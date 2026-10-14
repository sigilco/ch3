class View {
  label: string;

  constructor(label: string) {
    this.label = label;
  }

  render(): string {
    return "<p>" + this.label.split("<").join("&lt;") + "</p>";
  }
}

const html = new View("a<b").render();
if (html !== "<p>a&lt;b</p>") {
  console.log("FAIL class-method " + html);
  process.exit(1);
}
console.log("PASS class-method");
