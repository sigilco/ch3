const labels = new Map<string, string>();
labels.set("a", "alpha");
const got = labels.get("a");
if (got !== "alpha") {
  console.log("FAIL map");
  process.exit(1);
}
const seen = new Set<string>();
seen.add("a");
if (seen.has("a") !== true) {
  console.log("FAIL set");
  process.exit(1);
}
console.log("PASS map-string");
