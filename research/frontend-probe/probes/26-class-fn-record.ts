type Handler = (name: string) => string;

interface Entry {
  path: string;
  fn: Handler;
}

class App {
  routes: Entry[];
  constructor() {
    this.routes = [];
  }
  get(path: string, fn: Handler): void {
    this.routes.push({ path: path, fn: fn });
  }
  run(path: string, name: string): string {
    for (let i = 0; i < this.routes.length; i++) {
      if (this.routes[i].path === path) {
        return this.routes[i].fn(name);
      }
    }
    return "missing";
  }
}

const app = new App();
app.get(
  "/hello",
  function (name: string): string {
    return "<h1>" + name + "</h1>";
  },
);
console.log(app.run("/hello", "Ada"));
console.log(app.run("/nope", "Ada"));
