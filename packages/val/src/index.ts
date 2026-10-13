// val — a minimal Standard Schema validation library authored inside the
// scriptc-compilable subset, so it compiles to a native ELF alongside ch3
// (npm validation libraries cannot: importing one poisons program-code class
// instantiation under scriptc 0.3.0 — see docs/validation.md).
//
// API shape mirrors valibot where the subset allows it (~70-80% of the
// surface REST apps use). Structural constraints discovered under scriptc:
//   - Class fields can ONLY be concretely typed: no unknown/any/object/
//     record-of-unknown/array-of-unknown fields. Everything arbitrary
//     flows through function parameters/returns and plain records.
//   - Results are plain records (VSafeResult / VStdResult), not classes.
//   - VIssue carries type/expected/received/message/path — no `input`
//     (it is a valibot extension, not part of the Standard Schema spec;
//     an `unknown` field cannot compile).
//   - `literal()` and `optional()` defaults support string/number/boolean/
//     null only (values live in typed slots).
//   - No `| undefined` unions (undefined members simply can't compile);
//     optional fields use `| null`.
//   - No Date/File/Blob/Map/Set schemas, no async schemas, no function
//     values inside records — checks/transforms live on class instances.
//
// Subset notes (same rules as packages/ch3): `| null` unions only; indexed
// for loops + for..of over arrays; `instanceof` only on classes declared in
// this file; `as` casts at entry points for `unknown` params.

export class VIssue {
  // Spec-conformant members: message + path (PropertyKey segments).
  type: string;
  expected: string | null;
  received: string;
  message: string | null;
  path: string[] | null;

  constructor(
    type: string,
    expected: string | null,
    received: string,
    message: string | null,
    path: string[] | null,
  ) {
    this.type = String(type);
    this.expected = expected;
    this.received = String(received);
    this.message = message;
    this.path = path;
  }
}

export interface VSafeResult {
  success: boolean;
  output: unknown;
  issues: VIssue[] | null;
}

export interface VStdResult {
  value: unknown;
  issues: VIssue[] | null;
}

// Failure sentinel: `_run` returns this object — class identity is the
// discriminator (mirrors ch3's isSettled trick), never a data value.
class VFail {
  _f: number;
  constructor() {
    this._f = 1;
  }
}
const FAIL: VFail = new VFail();

export class StdProps {
  version: number;
  vendor: string;
  schema: VSchema;
  constructor(schema: VSchema) {
    this.version = 1;
    this.vendor = "val";
    this.schema = schema;
  }
  validate(input: unknown): VStdResult {
    const issues: VIssue[] = [];
    const path: string[] = [];
    const r = this.schema._run(input, issues, path);
    if (r instanceof VFail) {
      return { value: null, issues: issues };
    }
    return { value: r, issues: null };
  }
}

export class VSchema {
  kind: string;
  "~standard": StdProps = new StdProps(this);

  constructor(kind: string) {
    this.kind = String(kind);
  }

  // Returns the (possibly transformed) output, or the FAIL sentinel.
  _run(input: unknown, issues: VIssue[], path: string[]): unknown {
    return FAIL;
  }
}

// Best-effort output typing without generics (generic phantom fields cannot
// compile): resolves the concrete schema classes; VObject/VRecord resolve to
// open records, wrappers to unknown unions.
export type InferOutput<S> = S extends VStr
  ? string
  : S extends VNum
    ? number
    : S extends VBool
      ? boolean
      : S extends VArray | VTuple
        ? unknown[]
        : S extends VObject | VRecord
          ? { [k: string]: unknown }
          : unknown;

function receivedOf(input: unknown): string {
  if (input === null) {
    return "null";
  }
  const t = typeof input;
  if (t === "object" && Array.isArray(input)) {
    return "array";
  }
  return t;
}

function pushIssue(
  issues: VIssue[],
  type: string,
  input: unknown,
  expected: string | null,
  message: string | null,
  path: string[],
): void {
  issues.push(new VIssue(type, expected, receivedOf(input), message, path.slice()));
}

// ---------------------------------------------------------------- schemas

class VStr extends VSchema {
  constructor() {
    super("string");
  }
  _run(input: unknown, issues: VIssue[], path: string[]): unknown {
    if (typeof input === "string") {
      return input;
    }
    pushIssue(issues, "string", input, "string", null, path);
    return FAIL;
  }
}

class VNum extends VSchema {
  constructor() {
    super("number");
  }
  _run(input: unknown, issues: VIssue[], path: string[]): unknown {
    if (typeof input === "number" && !Number.isNaN(Number(input))) {
      return input;
    }
    pushIssue(issues, "number", input, "number", null, path);
    return FAIL;
  }
}

class VBool extends VSchema {
  constructor() {
    super("boolean");
  }
  _run(input: unknown, issues: VIssue[], path: string[]): unknown {
    if (typeof input === "boolean") {
      return input;
    }
    pushIssue(issues, "boolean", input, "boolean", null, path);
    return FAIL;
  }
}

class VAny extends VSchema {
  constructor() {
    super("any");
  }
  _run(input: unknown, issues: VIssue[], path: string[]): unknown {
    return input;
  }
}

class VNever extends VSchema {
  constructor() {
    super("never");
  }
  _run(input: unknown, issues: VIssue[], path: string[]): unknown {
    pushIssue(issues, "never", input, "never", null, path);
    return FAIL;
  }
}

// Literal requirements are string/number/boolean/null (typed slots).
class VLiteral extends VSchema {
  lkind: number; // 0 string, 1 number, 2 boolean, 3 null
  sReq: string;
  nReq: number;
  bReq: boolean;
  expects: string;

  constructor(req: unknown) {
    super("literal");
    this.sReq = "";
    this.nReq = 0;
    this.bReq = false;
    if (req === null) {
      this.lkind = 3;
      this.expects = "null";
    } else if (typeof req === "number") {
      this.lkind = 1;
      this.nReq = Number(req);
      this.expects = String(req);
    } else if (typeof req === "boolean") {
      this.lkind = 2;
      this.bReq = Boolean(req);
      this.expects = String(req);
    } else {
      this.lkind = 0;
      this.sReq = String(req);
      this.expects = String(req);
    }
  }
  _run(input: unknown, issues: VIssue[], path: string[]): unknown {
    let ok = false;
    if (this.lkind === 0 && input === this.sReq) {
      ok = true;
    } else if (this.lkind === 1 && input === this.nReq) {
      ok = true;
    } else if (this.lkind === 2 && input === this.bReq) {
      ok = true;
    } else if (this.lkind === 3 && input === null) {
      ok = true;
    }
    if (ok) {
      return input;
    }
    pushIssue(issues, "literal", input, this.expects, null, path);
    return FAIL;
  }
}

class VPicklist extends VSchema {
  options: string[];
  expects: string;
  constructor(options: string[]) {
    super("picklist");
    this.options = options;
    this.expects = options.join("|");
  }
  _run(input: unknown, issues: VIssue[], path: string[]): unknown {
    if (typeof input === "string") {
      const s = String(input);
      for (let i = 0; i < this.options.length; i++) {
        if (s === this.options[i]) {
          return s;
        }
      }
    }
    pushIssue(issues, "picklist", input, this.expects, null, path);
    return FAIL;
  }
}

class VNullable extends VSchema {
  inner: VSchema;
  constructor(inner: VSchema) {
    super("nullable");
    this.inner = inner;
  }
  _run(input: unknown, issues: VIssue[], path: string[]): unknown {
    if (input === null) {
      return null;
    }
    return this.inner._run(input, issues, path);
  }
}

// Optional with primitive default support (string/number/boolean/null).
class VOptional extends VSchema {
  inner: VSchema;
  hasDef: number;
  dkind: number; // 0 string, 1 number, 2 boolean, 3 null
  sDef: string;
  nDef: number;
  bDef: boolean;

  constructor(
    inner: VSchema,
    hasDef: number,
    dkind: number,
    sDef: string,
    nDef: number,
    bDef: boolean,
  ) {
    super("optional");
    this.inner = inner;
    this.hasDef = hasDef;
    this.dkind = dkind;
    this.sDef = sDef;
    this.nDef = nDef;
    this.bDef = bDef;
  }

  _def(): unknown {
    if (this.dkind === 0) {
      return this.sDef;
    }
    if (this.dkind === 1) {
      return this.nDef;
    }
    if (this.dkind === 2) {
      return this.bDef;
    }
    return null;
  }

  _run(input: unknown, issues: VIssue[], path: string[]): unknown {
    if (input === undefined) {
      return this.hasDef === 1 ? this._def() : undefined;
    }
    return this.inner._run(input, issues, path);
  }
}

class VNullish extends VSchema {
  inner: VSchema;
  constructor(inner: VSchema) {
    super("nullish");
    this.inner = inner;
  }
  _run(input: unknown, issues: VIssue[], path: string[]): unknown {
    if (input === null || input === undefined) {
      return input;
    }
    return this.inner._run(input, issues, path);
  }
}

class VArray extends VSchema {
  item: VSchema;
  constructor(item: VSchema) {
    super("array");
    this.item = item;
  }
  _run(input: unknown, issues: VIssue[], path: string[]): unknown {
    if (!Array.isArray(input)) {
      pushIssue(issues, "array", input, "Array", null, path);
      return FAIL;
    }
    const out: unknown[] = [];
    for (let i = 0; i < input.length; i++) {
      path.push(String(i));
      const r = this.item._run(input[i], issues, path);
      path.pop();
      if (r instanceof VFail) {
        return FAIL;
      }
      out.push(r);
    }
    return out;
  }
}

class VTuple extends VSchema {
  items: VSchema[];
  constructor(items: VSchema[]) {
    super("tuple");
    this.items = items;
  }
  _run(input: unknown, issues: VIssue[], path: string[]): unknown {
    if (!Array.isArray(input) || input.length !== this.items.length) {
      pushIssue(issues, "tuple", input, "Array[" + this.items.length + "]", null, path);
      return FAIL;
    }
    const out: unknown[] = [];
    for (let i = 0; i < this.items.length; i++) {
      path.push(String(i));
      const r = this.items[i]._run(input[i], issues, path);
      path.pop();
      if (r instanceof VFail) {
        return FAIL;
      }
      out.push(r);
    }
    return out;
  }
}

// Object modes: 0 = strip unknown keys (valibot `object`), 1 = loose (keep),
// 2 = strict (unknown keys are issues). Entries are parallel arrays plus a
// presence map — records cannot hold function/class-varying values.
class VObject extends VSchema {
  keys: string[];
  schemas: VSchema[];
  entryMap: { [k: string]: number };
  mode: number;

  constructor(entries: { [k: string]: VSchema }, mode: number) {
    super(mode === 0 ? "object" : mode === 1 ? "loose_object" : "strict_object");
    this.mode = mode;
    this.keys = [];
    this.schemas = [];
    this.entryMap = {};
    const ks = Object.keys(entries);
    for (let i = 0; i < ks.length; i++) {
      const k = String(ks[i]);
      this.keys.push(k);
      this.schemas.push(entries[k]);
      this.entryMap[k] = 1;
    }
  }

  _run(input: unknown, issues: VIssue[], path: string[]): unknown {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      pushIssue(issues, this.kind, input, "Object", null, path);
      return FAIL;
    }
    const src: { [k: string]: unknown } = input as { [k: string]: unknown };
    const out: { [k: string]: unknown } = {};
    let bad = 0;
    for (let i = 0; i < this.keys.length; i++) {
      const k = this.keys[i];
      const sch = this.schemas[i];
      const present = Object.prototype.hasOwnProperty.call(src, k) && src[k] !== undefined;
      if (!present) {
        if (sch instanceof VOptional) {
          if (sch.hasDef === 1) {
            out[k] = sch._def();
          }
          continue;
        }
        bad++;
        path.push(k);
        issues.push(new VIssue("required", "defined", "undefined", null, path.slice()));
        path.pop();
        continue;
      }
      path.push(k);
      const r = sch._run(src[k], issues, path);
      path.pop();
      if (r instanceof VFail) {
        bad++;
      } else {
        out[k] = r;
      }
    }
    if (this.mode === 2) {
      const inKeys = Object.keys(src);
      for (let i = 0; i < inKeys.length; i++) {
        const k = String(inKeys[i]);
        if (this.entryMap[k] === undefined) {
          bad++;
          path.push(k);
          issues.push(new VIssue("strict_object", "never", receivedOf(src[k]), null, path.slice()));
          path.pop();
        }
      }
    } else if (this.mode === 1) {
      const inKeys = Object.keys(src);
      for (let i = 0; i < inKeys.length; i++) {
        const k = String(inKeys[i]);
        if (this.entryMap[k] === undefined) {
          out[k] = src[k];
        }
      }
    }
    if (bad > 0) {
      return FAIL;
    }
    return out;
  }
}

class VRecord extends VSchema {
  keySch: VSchema;
  valSch: VSchema;
  constructor(keySch: VSchema, valSch: VSchema) {
    super("record");
    this.keySch = keySch;
    this.valSch = valSch;
  }
  _run(input: unknown, issues: VIssue[], path: string[]): unknown {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      pushIssue(issues, "record", input, "Object", null, path);
      return FAIL;
    }
    const src: { [k: string]: unknown } = input as { [k: string]: unknown };
    const out: { [k: string]: unknown } = {};
    const ks = Object.keys(src);
    let bad = 0;
    for (let i = 0; i < ks.length; i++) {
      const k = String(ks[i]);
      path.push(k);
      const rk = this.keySch._run(k, issues, path);
      if (rk instanceof VFail) {
        bad++;
      } else {
        const r = this.valSch._run(src[k], issues, path);
        if (r instanceof VFail) {
          bad++;
        } else {
          out[String(rk)] = r;
        }
      }
      path.pop();
    }
    if (bad > 0) {
      return FAIL;
    }
    return out;
  }
}

class VUnion extends VSchema {
  options: VSchema[];
  expects: string;
  constructor(options: VSchema[]) {
    super("union");
    this.options = options;
    const names: string[] = [];
    for (let i = 0; i < options.length; i++) {
      names.push(options[i].kind);
    }
    this.expects = names.join("|");
  }
  _run(input: unknown, issues: VIssue[], path: string[]): unknown {
    for (let i = 0; i < this.options.length; i++) {
      const sub: VIssue[] = [];
      const p2: string[] = [];
      const r = this.options[i]._run(input, sub, p2);
      if (!(r instanceof VFail)) {
        return r;
      }
    }
    pushIssue(issues, "union", input, this.expects, null, path);
    return FAIL;
  }
}

class VCustom extends VSchema {
  fn: (v: unknown) => boolean;
  expects: string;
  constructor(fn: (v: unknown) => boolean, expects: string) {
    super("custom");
    this.fn = fn;
    this.expects = String(expects);
  }
  _run(input: unknown, issues: VIssue[], path: string[]): unknown {
    if (this.fn(input)) {
      return input;
    }
    pushIssue(issues, "custom", input, this.expects, null, path);
    return FAIL;
  }
}

class VPipe extends VSchema {
  inner: VSchema;
  acts: VSchema[];
  constructor(inner: VSchema, acts: VSchema[]) {
    super("pipe");
    this.inner = inner;
    this.acts = acts;
  }
  _run(input: unknown, issues: VIssue[], path: string[]): unknown {
    const r = this.inner._run(input, issues, path);
    if (r instanceof VFail) {
      return FAIL;
    }
    let v: unknown = r;
    for (let i = 0; i < this.acts.length; i++) {
      const r2 = this.acts[i]._run(v, issues, path);
      if (r2 instanceof VFail) {
        return FAIL;
      }
      v = r2;
    }
    return v;
  }
}

// ---------------------------------------------------------------- actions
// Actions are schemas too (valibot semantics): a VSchema whose _run checks
// or transforms the piped value.

class VLengthAction extends VSchema {
  op: number; // 0 min, 1 max, 2 exact
  n: number;
  expects: string;
  msg: string | null;
  constructor(type: string, op: number, n: unknown, msg: string | null) {
    super(type);
    this.op = op;
    this.n = Number(n);
    this.expects = (op === 0 ? ">=" : op === 1 ? "<=" : "==") + this.n;
    this.msg = msg;
  }
  _run(input: unknown, issues: VIssue[], path: string[]): unknown {
    let len = -1;
    if (typeof input === "string") {
      len = String(input).length;
    } else if (Array.isArray(input)) {
      len = input.length;
    }
    if (len < 0) {
      return input;
    }
    const ok = this.op === 0 ? len >= this.n : this.op === 1 ? len <= this.n : len === this.n;
    if (!ok) {
      issues.push(new VIssue(this.kind, this.expects, String(len), this.msg, path.slice()));
      return FAIL;
    }
    return input;
  }
}

class VStrCheck extends VSchema {
  type: string;
  re: RegExp | null;
  str: string;
  expects: string;
  msg: string | null;
  // type: regex | email | uuid | url | ipv4 | digits | empty | starts_with | ends_with | includes
  constructor(type: string, re: RegExp | null, str: string, expects: string, msg: string | null) {
    super(type);
    this.type = String(type);
    this.re = re;
    this.str = String(str);
    this.expects = String(expects);
    this.msg = msg;
  }
  _run(input: unknown, issues: VIssue[], path: string[]): unknown {
    if (typeof input !== "string") {
      return input;
    }
    const s = String(input);
    let ok = true;
    const t = this.type;
    if (this.re !== null) {
      ok = this.re.test(s);
    } else if (t === "empty") {
      ok = s.length === 0;
    } else if (t === "starts_with") {
      ok = s.indexOf(this.str) === 0;
    } else if (t === "ends_with") {
      ok = s.length >= this.str.length && s.lastIndexOf(this.str) === s.length - this.str.length;
    } else if (t === "includes") {
      ok = s.indexOf(this.str) >= 0;
    }
    if (!ok) {
      issues.push(new VIssue(this.type, this.expects, s, this.msg, path.slice()));
      return FAIL;
    }
    return input;
  }
}

class VNumCheck extends VSchema {
  type: string;
  n: number;
  expects: string;
  msg: string | null;
  // type: integer | finite | safe_integer | min_value | max_value | gt_value | lt_value | multiple_of
  constructor(type: string, n: unknown, expects: string, msg: string | null) {
    super(type);
    this.type = String(type);
    this.n = Number(n);
    this.expects = String(expects);
    this.msg = msg;
  }
  _run(input: unknown, issues: VIssue[], path: string[]): unknown {
    if (typeof input !== "number") {
      return input;
    }
    const v = Number(input);
    let ok = true;
    const t = this.type;
    if (t === "integer") {
      ok = Number.isInteger(v);
    } else if (t === "finite") {
      ok = Number.isFinite(v);
    } else if (t === "safe_integer") {
      ok = Number.isSafeInteger(v);
    } else if (t === "min_value") {
      ok = v >= this.n;
    } else if (t === "max_value") {
      ok = v <= this.n;
    } else if (t === "gt_value") {
      ok = v > this.n;
    } else if (t === "lt_value") {
      ok = v < this.n;
    } else if (t === "multiple_of") {
      ok = this.n !== 0 && v % this.n === 0;
    }
    if (!ok) {
      issues.push(new VIssue(this.type, this.expects, String(v), this.msg, path.slice()));
      return FAIL;
    }
    return input;
  }
}

class VCheckAction extends VSchema {
  fn: (v: unknown) => boolean;
  expects: string;
  msg: string | null;
  constructor(fn: (v: unknown) => boolean, expects: string, msg: string | null) {
    super("check");
    this.fn = fn;
    this.expects = String(expects);
    this.msg = msg;
  }
  _run(input: unknown, issues: VIssue[], path: string[]): unknown {
    if (!this.fn(input)) {
      issues.push(new VIssue("check", this.expects, receivedOf(input), this.msg, path.slice()));
      return FAIL;
    }
    return input;
  }
}

class VTransformAction extends VSchema {
  fn: (v: unknown) => unknown;
  constructor(fn: (v: unknown) => unknown) {
    super("transform");
    this.fn = fn;
  }
  _run(input: unknown, issues: VIssue[], path: string[]): unknown {
    return this.fn(input);
  }
}

class VStrTransform extends VSchema {
  type: string;
  // type: trim | trim_start | trim_end | to_lower_case | to_upper_case
  constructor(type: string) {
    super(type);
    this.type = String(type);
  }
  _run(input: unknown, issues: VIssue[], path: string[]): unknown {
    if (typeof input !== "string") {
      return input;
    }
    const s = String(input);
    const t = this.type;
    if (t === "trim") {
      return s.trim();
    }
    if (t === "trim_start") {
      return s.trimStart();
    }
    if (t === "trim_end") {
      return s.trimEnd();
    }
    if (t === "to_lower_case") {
      return s.toLowerCase();
    }
    return s.toUpperCase();
  }
}

class VNumClamp extends VSchema {
  type: string;
  n: number;
  constructor(type: string, n: unknown) {
    super(type);
    this.type = String(type);
    this.n = Number(n);
  }
  _run(input: unknown, issues: VIssue[], path: string[]): unknown {
    if (typeof input !== "number") {
      return input;
    }
    const v = Number(input);
    if (this.type === "to_min_value") {
      return v < this.n ? this.n : v;
    }
    return v > this.n ? this.n : v;
  }
}

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

// ---------------------------------------------------------------- factories

export function string(): VSchema {
  return new VStr();
}
export function number(): VSchema {
  return new VNum();
}
export function boolean(): VSchema {
  return new VBool();
}
export function any(): VSchema {
  return new VAny();
}
export function unknown(): VSchema {
  return new VAny();
}
export function never(): VSchema {
  return new VNever();
}
export function literal(req: string | number | boolean | null): VSchema {
  return new VLiteral(req);
}
export function picklist(options: string[]): VSchema {
  return new VPicklist(options);
}
export function nullable(inner: VSchema): VSchema {
  return new VNullable(inner);
}
export function optional(inner: VSchema): VSchema {
  return new VOptional(inner, 0, 3, "", 0, false);
}
export function optionalStr(inner: VSchema, def: string): VSchema {
  return new VOptional(inner, 1, 0, def, 0, false);
}
export function optionalNum(inner: VSchema, def: number): VSchema {
  return new VOptional(inner, 1, 1, "", def, false);
}
export function optionalBool(inner: VSchema, def: boolean): VSchema {
  return new VOptional(inner, 1, 2, "", 0, def);
}
export function nullish(inner: VSchema): VSchema {
  return new VNullish(inner);
}
export function array(item: VSchema): VSchema {
  return new VArray(item);
}
export function tuple(items: VSchema[]): VSchema {
  return new VTuple(items);
}
export function object(entries: { [k: string]: VSchema }): VSchema {
  return new VObject(entries, 0);
}
export function looseObject(entries: { [k: string]: VSchema }): VSchema {
  return new VObject(entries, 1);
}
export function strictObject(entries: { [k: string]: VSchema }): VSchema {
  return new VObject(entries, 2);
}
export function record(keySch: VSchema, valSch: VSchema): VSchema {
  return new VRecord(keySch, valSch);
}
export function union(options: VSchema[]): VSchema {
  return new VUnion(options);
}
export function custom(fn: (v: unknown) => boolean, expects?: string): VSchema {
  return new VCustom(fn, expects === undefined ? "custom" : expects);
}

export function pipe(inner: VSchema, ...acts: VSchema[]): VSchema {
  return new VPipe(inner, acts);
}

// length actions (string | array length)
export function minLength(n: number, msg?: string): VSchema {
  return new VLengthAction("min_length", 0, n, msg === undefined ? null : msg);
}
export function maxLength(n: number, msg?: string): VSchema {
  return new VLengthAction("max_length", 1, n, msg === undefined ? null : msg);
}
export function length(n: number, msg?: string): VSchema {
  return new VLengthAction("length", 2, n, msg === undefined ? null : msg);
}
export function nonEmpty(msg?: string): VSchema {
  return new VLengthAction("non_empty", 0, 1, msg === undefined ? null : msg);
}
export function empty(msg?: string): VSchema {
  return new VStrCheck("empty", null, "", "empty", msg === undefined ? null : msg);
}

// string checks
export function regex(re: RegExp, msg?: string): VSchema {
  return new VStrCheck("regex", re, "", String(re), msg === undefined ? null : msg);
}
const EMAIL_RE = /^[\w+-]+(?:\.[\w+-]+)*@[\da-zA-Z]+(?:[.-][\da-zA-Z]+)*\.[a-zA-Z]{2,}$/;
export function email(msg?: string): VSchema {
  return new VStrCheck("email", EMAIL_RE, "", "email", msg === undefined ? null : msg);
}
const UUID_RE = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu;
export function uuid(msg?: string): VSchema {
  return new VStrCheck("uuid", UUID_RE, "", "uuid", msg === undefined ? null : msg);
}
const URL_RE = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\/\S+$/u;
export function url(msg?: string): VSchema {
  return new VStrCheck("url", URL_RE, "", "url", msg === undefined ? null : msg);
}
const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/u;
export function ipv4(msg?: string): VSchema {
  return new VStrCheck("ipv4", IPV4_RE, "", "ipv4", msg === undefined ? null : msg);
}
const DIGITS_RE = /^\d+$/u;
export function digits(msg?: string): VSchema {
  return new VStrCheck("digits", DIGITS_RE, "", "digits", msg === undefined ? null : msg);
}
export function startsWith(s: string, msg?: string): VSchema {
  return new VStrCheck("starts_with", null, s, s, msg === undefined ? null : msg);
}
export function endsWith(s: string, msg?: string): VSchema {
  return new VStrCheck("ends_with", null, s, s, msg === undefined ? null : msg);
}
export function includes(s: string, msg?: string): VSchema {
  return new VStrCheck("includes", null, s, s, msg === undefined ? null : msg);
}

// number checks (expects strings built directly — safe under scriptc;
// valibot's own minValue/maxValue hit SC2020 Date-fences at construction)
export function integer(msg?: string): VSchema {
  return new VNumCheck("integer", 0, "integer", msg === undefined ? null : msg);
}
export function finite(msg?: string): VSchema {
  return new VNumCheck("finite", 0, "finite", msg === undefined ? null : msg);
}
export function safeInteger(msg?: string): VSchema {
  return new VNumCheck("safe_integer", 0, "safe integer", msg === undefined ? null : msg);
}
export function minValue(n: number, msg?: string): VSchema {
  return new VNumCheck("min_value", n, ">=" + n, msg === undefined ? null : msg);
}
export function maxValue(n: number, msg?: string): VSchema {
  return new VNumCheck("max_value", n, "<=" + n, msg === undefined ? null : msg);
}
export function gtValue(n: number, msg?: string): VSchema {
  return new VNumCheck("gt_value", n, ">" + n, msg === undefined ? null : msg);
}
export function ltValue(n: number, msg?: string): VSchema {
  return new VNumCheck("lt_value", n, "<" + n, msg === undefined ? null : msg);
}
export function multipleOf(n: number, msg?: string): VSchema {
  return new VNumCheck("multiple_of", n, "%" + n, msg === undefined ? null : msg);
}

// custom + transform
export function check(fn: (v: unknown) => boolean, msg?: string): VSchema {
  return new VCheckAction(fn, "check", msg === undefined ? null : msg);
}
export function transform(fn: (v: unknown) => unknown): VSchema {
  return new VTransformAction(fn);
}
export function trim(): VSchema {
  return new VStrTransform("trim");
}
export function trimStart(): VSchema {
  return new VStrTransform("trim_start");
}
export function trimEnd(): VSchema {
  return new VStrTransform("trim_end");
}
export function toLowerCase(): VSchema {
  return new VStrTransform("to_lower_case");
}
export function toUpperCase(): VSchema {
  return new VStrTransform("to_upper_case");
}
export function toMinValue(n: number): VSchema {
  return new VNumClamp("to_min_value", n);
}
export function toMaxValue(n: number): VSchema {
  return new VNumClamp("to_max_value", n);
}
