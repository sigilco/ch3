function item(s: string): string {
  return "<li>" + s + "</li>";
}

const fns: Array<(s: string) => string> = [item];
const html = fns[0]("a");
if (html !== "<li>a</li>") {
  console.log("FAIL fn-array " + html);
  process.exit(1);
}
console.log("PASS fn-array");
