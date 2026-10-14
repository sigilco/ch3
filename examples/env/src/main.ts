// env: boot-time environment validation with @chttp/val.
//
// createEnv is a pattern, not a package: it lives inline in this file so it
// compiles into the ELF next to your app. Reads process.env once at boot,
// validates with a plain-record schema, prints summarize() and exits on
// failure, then hands the typed record to the app.
import { createRouter } from "@chttp/router";
import type { Ctx } from "@chttp/router";
import * as v from "@chttp/val";
import type { VSchema } from "@chttp/val";

type EnvSpec = { [k: string]: VSchema };

interface EnvResult {
  ok: boolean;
  env: { [k: string]: unknown } | null;
  report: string | null;
}

// v.object (not strictObject): process.env always carries dozens of
// unrelated keys (PATH, HOME, ...); plain object validates the spec keys
// and strips the rest instead of failing on every unrelated variable.
function createEnv(spec: EnvSpec): EnvResult {
  const r = v.safeParse(v.object(spec), process.env);
  if (r.success) {
    return { ok: true, env: r.output as { [k: string]: unknown }, report: null };
  }
  return { ok: false, env: null, report: v.summarize(r.issues === null ? [] : r.issues) };
}

// Env schema: PORT is a string in env vars, transform coerces to number,
// then minValue checks the coerced value. Feature flags are literal unions
// with defaults via optionalStr.
const Env = createEnv({
  PORT: v.pipe(
    v.string(),
    v.transform((s: unknown): unknown => Number(s)),
    v.minValue(1),
    v.maxValue(65535),
  ),
  HOST: v.optionalStr(v.string(), "127.0.0.1"),
  LOG_LEVEL: v.optionalStr(v.pipe(v.string(), v.toLowerCase()), "info"),
  NEW_FEATURE: v.optionalStr(v.union([v.literal("on"), v.literal("off")]), "off"),
});

if (!Env.ok) {
  console.error("invalid environment:\n" + Env.report);
  process.exit(1);
}

const env: { [k: string]: unknown } = Env.env as { [k: string]: unknown };
const port = env["PORT"] as number;

const app = createRouter();

// One route echoes the validated feature flag back: the flag reached here
// already coerced and checked, no per-request validation needed.
app.get("/flag", (c: Ctx) => {
  return c.json({ new_feature: env["NEW_FEATURE"], log_level: env["LOG_LEVEL"] });
});

app.get("/", (c: Ctx) => {
  return c.text("env-validated chttp on port " + String(port));
});

app.serve({ port: port, host: String(env["HOST"]) });
console.log(
  "listening on " +
    String(env["HOST"]) +
    ":" +
    String(port) +
    " (feature flag: " +
    String(env["NEW_FEATURE"]) +
    ")",
);
