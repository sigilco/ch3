// Entry-point parsing, error type, and issue reporting helpers.

import type { VSafeResult } from "./types.ts";
import { VFail, VIssue, VSchema } from "./types.ts";

// ---------------------------------------------------------------- errors

export class VError extends Error {
  issues: VIssue[];
  constructor(issues: VIssue[]) {
    const p0 = issues.length > 0 && issues[0].path !== null ? issues[0].path.join(".") : "";
    super(issues.length > 0 ? String(issues[0].type) + " at " + p0 : "validation failed");
    this.name = "VError";
    this.issues = issues;
  }
}

// ---------------------------------------------------------------- entry

export function safeParse(schema: VSchema, input: unknown): VSafeResult {
  const issues: VIssue[] = [];
  const path: string[] = [];
  const r = schema._run(input, issues, path);
  if (r instanceof VFail) {
    return { success: false, output: null, issues: issues };
  }
  return { success: true, output: r, issues: null };
}

export function parse(schema: VSchema, input: unknown): unknown {
  const r = safeParse(schema, input);
  if (!r.success) {
    throw new VError(r.issues === null ? [] : r.issues);
  }
  return r.output;
}

export function is(schema: VSchema, input: unknown): boolean {
  const issues: VIssue[] = [];
  const path: string[] = [];
  return !(schema._run(input, issues, path) instanceof VFail);
}

export function assert(schema: VSchema, input: unknown): void {
  const r = safeParse(schema, input);
  if (!r.success) {
    throw new VError(r.issues === null ? [] : r.issues);
  }
}

export interface VFlatIssues {
  root: string[];
  nested: { [k: string]: string[] };
}

export function flatten(issues: VIssue[]): VFlatIssues {
  const out: VFlatIssues = { root: [], nested: {} };
  for (let i = 0; i < issues.length; i++) {
    const iss = issues[i];
    const m = iss.message === null ? iss.type : String(iss.message);
    if (iss.path === null || iss.path.length === 0) {
      out.root.push(m);
      continue;
    }
    const p = iss.path.join(".");
    if (out.nested[p] === undefined) {
      out.nested[p] = [];
    }
    out.nested[p].push(m);
  }
  return out;
}

export function summarize(issues: VIssue[]): string {
  const parts: string[] = [];
  for (let i = 0; i < issues.length; i++) {
    const iss = issues[i];
    const p = iss.path === null ? "" : iss.path.join(".");
    parts.push(p + ": " + (iss.message === null ? iss.type : String(iss.message)));
  }
  return parts.join("\n");
}
