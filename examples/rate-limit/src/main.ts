// rate-limit: per-client fixed window limiter as global middleware.
import { buildApp } from "./app.ts";

buildApp(5, 10000).serve({ port: 3000 });
