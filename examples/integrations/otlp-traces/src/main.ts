import { createApp } from "./app.ts";
import { newExporter } from "./otlp.ts";

// Collector on argv[2] (default 4318, the OTLP/HTTP port), batch of 5 spans.
const collectorPort = process.argv.length > 2 ? Number(process.argv[2]) : 4318;
const app = createApp(newExporter("chttp-otlp-example", "127.0.0.1", collectorPort, 5));
app.serve({ port: 3000 });
