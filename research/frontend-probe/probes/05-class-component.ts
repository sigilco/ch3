class Page {
  name: string;
  constructor(name: string) {
    this.name = String(name);
  }
  render(): string {
    return "<h1>" + this.name + "</h1>";
  }
}

const p = new Page("Ada");
console.log(p.render());
