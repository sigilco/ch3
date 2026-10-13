// Unit tests for @ch3/val — runs on the tsc build (node --test).
// The same src compiles to ELF via scriptc; see bench/apps/ch3-val.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as v from "../dist/esm/index.js";

test("primitive schemas accept and reject", () => {
  assert.equal(v.is(v.string(), "x"), true);
  assert.equal(v.is(v.string(), 1), false);
  assert.equal(v.is(v.number(), 1.5), true);
  assert.equal(v.is(v.number(), NaN), false);
  assert.equal(v.is(v.boolean(), true), true);
  assert.equal(v.is(v.boolean(), "true"), false);
  assert.equal(v.is(v.any(), { a: 1 }), true);
  assert.equal(v.is(v.never(), 1), false);
});

test("literal and picklist", () => {
  assert.equal(v.is(v.literal("a"), "a"), true);
  assert.equal(v.is(v.literal("a"), "b"), false);
  assert.equal(v.is(v.literal(42), 42), true);
  assert.equal(v.is(v.literal(true), true), true);
  assert.equal(v.is(v.literal(null), null), true);
  assert.equal(v.is(v.picklist(["a", "b"]), "b"), true);
  assert.equal(v.is(v.picklist(["a", "b"]), "c"), false);
});

test("strictObject strips nothing, flags unknown keys", () => {
  const S = v.strictObject({ a: v.string() });
  const ok = v.safeParse(S, { a: "x" });
  assert.equal(ok.success, true);
  assert.deepEqual(ok.output, { a: "x" });
  const bad = v.safeParse(S, { a: "x", z: 1 });
  assert.equal(bad.success, false);
  assert.equal(bad.issues.length, 1);
  assert.equal(bad.issues[0].type, "strict_object");
  assert.deepEqual(bad.issues[0].path, ["z"]);
});

test("object strips unknown keys; looseObject keeps them", () => {
  const strip = v.safeParse(v.object({ a: v.string() }), { a: "x", z: 1 });
  assert.equal(strip.success, true);
  assert.deepEqual(strip.output, { a: "x" });
  const loose = v.safeParse(v.looseObject({ a: v.string() }), { a: "x", z: 1 });
  assert.equal(loose.success, true);
  assert.deepEqual(loose.output, { a: "x", z: 1 });
});

test("nested issue paths", () => {
  const Order = v.strictObject({
    items: v.array(v.strictObject({ qty: v.number() })),
  });
  const r = v.safeParse(Order, { items: [{ qty: 1 }, { qty: "x" }] });
  assert.equal(r.success, false);
  assert.deepEqual(r.issues[0].path, ["items", "1", "qty"]);
});

test("optional / nullable / nullish / defaults", () => {
  const S = v.strictObject({ a: v.optional(v.string()), b: v.optionalStr(v.string(), "d") });
  const r = v.safeParse(S, {});
  assert.equal(r.success, true);
  assert.equal(r.output.b, "d");
  assert.equal(v.is(v.nullable(v.string()), null), true);
  assert.equal(v.is(v.nullable(v.string()), "x"), true);
  assert.equal(v.is(v.nullish(v.string()), null), true);
  assert.equal(v.is(v.optionalNum(v.number(), 5), undefined), true);
});

test("missing required key", () => {
  const S = v.strictObject({ a: v.string() });
  const r = v.safeParse(S, {});
  assert.equal(r.success, false);
  assert.equal(r.issues[0].type, "required");
  assert.deepEqual(r.issues[0].path, ["a"]);
});

test("array + tuple", () => {
  assert.equal(v.is(v.array(v.number()), [1, 2]), true);
  assert.equal(v.is(v.array(v.number()), [1, "x"]), false);
  assert.equal(v.is(v.tuple([v.string(), v.number()]), ["a", 1]), true);
  assert.equal(v.is(v.tuple([v.string(), v.number()]), ["a"]), false);
});

test("union picks first matching arm", () => {
  const U = v.union([v.string(), v.number()]);
  assert.equal(v.is(U, "x"), true);
  assert.equal(v.is(U, 3), true);
  assert.equal(v.is(U, false), false);
});

test("record validates values", () => {
  const R = v.record(v.string(), v.number());
  assert.equal(v.is(R, { a: 1 }), true);
  assert.equal(v.is(R, { a: "x" }), false);
});

test("pipe runs actions in order, collects issues", () => {
  const S = v.pipe(v.string(), v.minLength(2), v.maxLength(4));
  assert.equal(v.is(S, "abc"), true);
  const short = v.safeParse(S, "a");
  assert.equal(short.success, false);
  assert.equal(short.issues[0].type, "min_length");
  assert.equal(short.issues[0].expected, ">=2");
});

test("string checks: email uuid regex startsWith endsWith includes digits empty ipv4 url", () => {
  assert.equal(v.is(v.pipe(v.string(), v.email()), "a@b.co"), true);
  assert.equal(v.is(v.pipe(v.string(), v.email()), "nope"), false);
  assert.equal(v.is(v.pipe(v.string(), v.uuid()), "7c9e6679-7425-40de-944b-e07fc1f90ae7"), true);
  assert.equal(v.is(v.pipe(v.string(), v.uuid()), "x"), false);
  assert.equal(v.is(v.pipe(v.string(), v.regex(/^a+$/)), "aaa"), true);
  assert.equal(v.is(v.pipe(v.string(), v.startsWith("ab")), "abc"), true);
  assert.equal(v.is(v.pipe(v.string(), v.endsWith("bc")), "abc"), true);
  assert.equal(v.is(v.pipe(v.string(), v.includes("b")), "abc"), true);
  assert.equal(v.is(v.pipe(v.string(), v.digits()), "0123"), true);
  assert.equal(v.is(v.pipe(v.string(), v.empty()), ""), true);
  assert.equal(v.is(v.pipe(v.string(), v.ipv4()), "10.0.0.1"), true);
  assert.equal(v.is(v.pipe(v.string(), v.ipv4()), "999.1.1.1"), false);
  assert.equal(v.is(v.pipe(v.string(), v.url()), "https://x.y"), true);
});

test("number checks", () => {
  assert.equal(v.is(v.pipe(v.number(), v.integer()), 3), true);
  assert.equal(v.is(v.pipe(v.number(), v.integer()), 3.5), false);
  assert.equal(v.is(v.pipe(v.number(), v.finite()), 1), true);
  assert.equal(v.is(v.pipe(v.number(), v.finite()), Infinity), false);
  assert.equal(v.is(v.pipe(v.number(), v.minValue(2)), 2), true);
  assert.equal(v.is(v.pipe(v.number(), v.maxValue(2)), 3), false);
  assert.equal(v.is(v.pipe(v.number(), v.gtValue(2)), 3), true);
  assert.equal(v.is(v.pipe(v.number(), v.ltValue(2)), 1), true);
  assert.equal(v.is(v.pipe(v.number(), v.multipleOf(3)), 9), true);
  assert.equal(v.is(v.pipe(v.number(), v.safeInteger()), 2 ** 53), false);
});

test("custom check + message", () => {
  const S = v.pipe(
    v.number(),
    v.check((n) => n > 0, "must be positive"),
  );
  const r = v.safeParse(S, -1);
  assert.equal(r.success, false);
  assert.equal(r.issues[0].message, "must be positive");
  assert.equal(
    v.is(
      v.custom((x) => x === "ok"),
      "ok",
    ),
    true,
  );
});

test("transform + string transforms + clamps", () => {
  const S = v.pipe(v.string(), v.trim(), v.toUpperCase());
  const r = v.safeParse(S, "  ab ");
  assert.equal(r.success, true);
  assert.equal(r.output, "AB");
  const T = v.pipe(
    v.string(),
    v.transform((s) => s.length),
  );
  assert.equal(v.safeParse(T, "abcd").output, 4);
  assert.equal(v.safeParse(v.pipe(v.number(), v.toMinValue(5)), 3).output, 5);
  assert.equal(v.safeParse(v.pipe(v.number(), v.toMaxValue(5)), 9).output, 5);
  assert.equal(v.safeParse(v.pipe(v.string(), v.trimStart()), " a ").output, "a ");
  assert.equal(v.safeParse(v.pipe(v.string(), v.trimEnd()), " a ").output, " a");
  assert.equal(v.safeParse(v.pipe(v.string(), v.toLowerCase()), "AB").output, "ab");
});

test("parse throws VError with issues; assert throws", () => {
  assert.throws(() => v.parse(v.string(), 1), v.VError);
  try {
    v.parse(v.string(), 1);
    assert.fail("no throw");
  } catch (e) {
    assert.equal(e instanceof v.VError, true);
    assert.equal(e.issues.length, 1);
  }
  assert.throws(() => v.assert(v.number(), "x"));
  assert.equal(v.assert(v.number(), 1), undefined);
});

test("~standard props + validate result", () => {
  const S = v.object({ a: v.string() });
  const std = S["~standard"];
  assert.equal(std.version, 1);
  assert.equal(std.vendor, "val");
  const ok = std.validate({ a: "x" });
  assert.equal(ok.issues, null);
  assert.deepEqual(ok.value, { a: "x" });
  const bad = std.validate({ a: 1 });
  assert.equal(bad.value, null);
  assert.equal(bad.issues.length, 1);
});

test("flatten + summarize", () => {
  const S = v.strictObject({ a: v.pipe(v.string(), v.minLength(2)) });
  const r = v.safeParse(S, { a: "x" });
  const f = v.flatten(r.issues);
  assert.deepEqual(f.nested["a"], ["min_length"]);
  const s = v.summarize(r.issues);
  assert.match(s, /a: min_length/);
});

test("safeParse output keeps transformed nested values", () => {
  const S = v.strictObject({
    n: v.pipe(
      v.string(),
      v.transform((s) => s.length),
    ),
  });
  const r = v.safeParse(S, { n: "abc" });
  assert.equal(r.output.n, 3);
});
