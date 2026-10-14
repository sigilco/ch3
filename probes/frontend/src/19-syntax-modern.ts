type Box = { name: string } | null;

function read(b: Box): string {
  return b?.name ?? "empty";
}

function len(s: string | undefined): number {
  if (s === undefined) {
    return 0;
  }
  return s.length;
}

const person = { name: "ada" };
const copy = { ...person, name: "ada" };
if (read(null) !== "empty" || read({ name: "a<b>" }) !== "a<b>" || len(undefined) !== 0) {
  console.log("FAIL syntax");
  process.exit(1);
}
if (copy.name !== "ada") {
  console.log("FAIL spread");
  process.exit(1);
}
console.log("PASS syntax-modern");
