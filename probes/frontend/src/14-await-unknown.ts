async function load(): Promise<string> {
  return "joined";
}

async function boundary(run: () => unknown): Promise<string> {
  const r: unknown = run();
  if (typeof r === "string") {
    return r;
  }
  const joined: unknown = await r;
  if (typeof joined === "string") {
    return joined;
  }
  return "other";
}

const sync = await boundary(function (): unknown {
  return "sync";
});
const asyncd = await boundary(function (): unknown {
  return load();
});
if (sync !== "sync" || asyncd !== "joined") {
  console.log("FAIL await-unknown " + sync + " " + asyncd);
  process.exit(1);
}
console.log("PASS await-unknown");
