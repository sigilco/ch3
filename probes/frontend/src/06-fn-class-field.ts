class Slot {
  render: (name: string) => string;

  constructor(render: (name: string) => string) {
    this.render = render;
  }
}

const slot = new Slot(function (name: string): string {
  return "hi " + name;
});

const html = slot.render("a");
if (html !== "hi a") {
  console.log("FAIL fn-class-field " + html);
  process.exit(1);
}
console.log("PASS fn-class-field");
