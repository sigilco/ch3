// backpressure: in-flight cap (503) and body size cap (413) as global middleware.
import { buildApp } from "./app.ts";

buildApp(2, 1024, 300).serve({ port: 3000 });
