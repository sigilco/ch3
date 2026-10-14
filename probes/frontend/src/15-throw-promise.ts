// Node joins a thrown promise (`joined-type=string`). scriptc 0.3.1 compiles
// this file and then diverges: `joined-type=object` under both -O0 and -O2,
// so the process exits 1. Suspense-by-throw is not shippable.
async function load(): Promise<string> {
  return "from-throw";
}

function view(): string {
  throw load();
}

async function boundary(): Promise<string> {
  try {
    return view();
  } catch (e) {
    const thrown: unknown = e;
    console.log("thrown-type=" + typeof thrown);
    const joined: unknown = await thrown;
    console.log("joined-type=" + typeof joined);
    if (typeof joined === "string") {
      return joined;
    }
    return "other";
  }
}

const html = await boundary();
if (html !== "from-throw") {
  console.log("FAIL throw-promise " + html);
  process.exit(1);
}
console.log("PASS throw-promise");
