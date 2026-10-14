// Node-only entry: LogTape with the blocking @logtape/file sink. LogTape core
// does not compile under scriptc (SC1016 circular import), so this stays on node.
import { configureSync, getLogger } from "@logtape/logtape";
import { getFileSink } from "@logtape/file";
import { createApp } from "./app.ts";

const path = process.argv.length > 2 ? process.argv[2] : "audit.log";
configureSync({
  sinks: { audit: getFileSink(path, { bufferSize: 0 }) },
  loggers: [{ category: ["audit"], sinks: ["audit"], lowestLevel: "info" }],
});
const log = getLogger(["audit"]);
const app = createApp((level: string, message: string): void => {
  if (level === "WRN") log.warn(message);
  else log.info(message);
});
app.serve({ port: 3000 });
