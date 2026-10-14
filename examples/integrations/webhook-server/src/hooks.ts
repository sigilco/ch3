import { execFileSync } from "node:child_process";
import { createHmac, timingSafeEqual } from "node:crypto";
import * as v from "@chttp/val";

// Config shape. Every hook is an argv vector: no shell, no interpolation.
// Payload values reach the child only as environment variables.
const Rule = v.strictObject({ field: v.string(), equals: v.string() });
const EnvMap = v.strictObject({ field: v.string(), name: v.string() });
const Hook = v.strictObject({
  id: v.pipe(v.string(), v.minLength(1)),
  command: v.pipe(v.string(), v.minLength(1)),
  args: v.array(v.string()),
  secret: v.pipe(v.string(), v.minLength(1)),
  rules: v.array(Rule),
  env: v.array(EnvMap),
});
export const HooksConfig = v.array(Hook);

export interface HookRule {
  field: string;
  equals: string;
}
export interface HookEnv {
  field: string;
  name: string;
}
export interface HookDef {
  id: string;
  command: string;
  args: string[];
  secret: string;
  rules: HookRule[];
  env: HookEnv[];
}

export interface RunResult {
  ok: boolean;
  output: string;
}

// Returns the parsed hooks, or null after printing why the config is invalid.
export function parseHooks(json: string): HookDef[] | null {
  const r = v.safeParse(HooksConfig, JSON.parse(json));
  if (!r.success) {
    console.log("invalid hooks config: " + v.summarize(r.issues || []));
    return null;
  }
  return r.output as HookDef[];
}

export function findHook(hooks: HookDef[], id: string): HookDef | null {
  for (let i = 0; i < hooks.length; i++) {
    if (hooks[i].id === id) return hooks[i];
  }
  return null;
}

// header is "sha256=<hex>" (GitHub style). Constant time compare; a length
// mismatch is rejected up front because timingSafeEqual throws on it.
export function verifySignature(secret: string, body: string, header: string): boolean {
  if (header.length < 8 || header.substring(0, 7) !== "sha256=") return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(body).digest("hex"), "hex");
  const given = Buffer.from(header.substring(7), "hex");
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

// Top level scalar fields only, compared by their string form.
export function fieldString(payload: Record<string, unknown>, field: string): string | null {
  const x = payload[field];
  if (typeof x === "string") return x;
  if (typeof x === "number") return "" + x;
  if (typeof x === "boolean") return x ? "true" : "false";
  return null;
}

export function rulesMatch(hook: HookDef, payload: Record<string, unknown>): boolean {
  for (let i = 0; i < hook.rules.length; i++) {
    const got = fieldString(payload, hook.rules[i].field);
    if (got === null || got !== hook.rules[i].equals) return false;
  }
  return true;
}

export function runHook(hook: HookDef, payload: Record<string, unknown>): RunResult {
  const env: Record<string, string> = { HOOK_ID: hook.id };
  for (let i = 0; i < hook.env.length; i++) {
    const val = fieldString(payload, hook.env[i].field);
    if (val !== null) env[hook.env[i].name] = val;
  }
  // execFileSync honours env under scriptc; spawnSync's env option has no
  // lowering yet (SC2020). A non-zero exit or a missing binary throws.
  try {
    const out = execFileSync(hook.command, hook.args, { env: env, encoding: "utf8" });
    return { ok: true, output: out };
  } catch (e) {
    return { ok: false, output: "hook command failed" };
  }
}
