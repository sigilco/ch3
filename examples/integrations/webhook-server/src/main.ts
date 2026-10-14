import { readFileSync } from "node:fs";
import { createApp } from "./app.ts";
import { parseHooks } from "./hooks.ts";

const path = process.argv.length > 2 ? process.argv[2] : "hooks.json";
const hooks = parseHooks(readFileSync(path, "utf8"));
if (hooks === null) {
  process.exit(1);
}
createApp(hooks as NonNullable<typeof hooks>).serve({ port: 3000 });
console.log("webhook server on :3000, hooks from " + path);
