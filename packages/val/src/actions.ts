// Pipe actions — schemas that check or transform the piped value
// (valibot semantics), on the same VSchema base.

import { FAIL, VIssue, VSchema, receivedOf } from "./types.ts";

// ---------------------------------------------------------------- actions
// Actions are schemas too (valibot semantics): a VSchema whose _run checks
// or transforms the piped value.

export class VLengthAction extends VSchema {
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

export class VStrCheck extends VSchema {
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

export class VNumCheck extends VSchema {
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

export class VCheckAction extends VSchema {
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

export class VTransformAction extends VSchema {
  fn: (v: unknown) => unknown;
  constructor(fn: (v: unknown) => unknown) {
    super("transform");
    this.fn = fn;
  }
  _run(input: unknown, issues: VIssue[], path: string[]): unknown {
    return this.fn(input);
  }
}

export class VStrTransform extends VSchema {
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

export class VNumClamp extends VSchema {
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
