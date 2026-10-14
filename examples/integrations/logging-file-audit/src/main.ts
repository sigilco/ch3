// ELF entry (also runs on node): custom sync sink via fs.appendFileSync.
import { createApp } from "./app.ts";
import { fileAudit } from "./audit.ts";

const path = process.argv.length > 2 ? process.argv[2] : "audit.log";
const app = createApp((level: string, message: string): void => {
  fileAudit(path, level, message);
});
app.serve({ port: 3000 });
console.log("audit log: " + path);
