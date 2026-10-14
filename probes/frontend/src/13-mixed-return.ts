async function load(): Promise<string> {
  return "x";
}

function maybe(flag: boolean): string | Promise<string> {
  if (flag) {
    return "sync";
  }
  return load();
}

async function join(flag: boolean): Promise<string> {
  const v = maybe(flag);
  return await v;
}

const a = await join(true);
const b = await join(false);
if (a !== "sync" || b !== "x") {
  console.log("FAIL mixed " + a + " " + b);
  process.exit(1);
}
console.log("PASS mixed-return");
