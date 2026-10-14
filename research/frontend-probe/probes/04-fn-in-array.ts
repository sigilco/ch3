type Comp = (name: string) => string;

function hello(name: string): string {
  return "<p>" + name + "</p>";
}

function bye(name: string): string {
  return "<p>bye " + name + "</p>";
}

const fns: Comp[] = [hello, bye];
let out = "";
for (let i = 0; i < fns.length; i++) {
  out = out + fns[i]("Ada");
}
console.log(out);
