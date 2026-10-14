// JSON Schema emission tests for @chttp/val — runs on the tsc build
// (node --test), same convention as val.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as v from "../dist/esm/index.js";

test("primitives map to type nodes; any/never", () => {
  assert.deepEqual(v.toJsonSchema(v.string()), { type: "string" });
  assert.deepEqual(v.toJsonSchema(v.number()), { type: "number" });
  assert.deepEqual(v.toJsonSchema(v.boolean()), { type: "boolean" });
  assert.deepEqual(v.toJsonSchema(v.any()), {});
  assert.deepEqual(v.toJsonSchema(v.unknown()), {});
  assert.deepEqual(v.toJsonSchema(v.never()), { not: {} });
});

test("literal and picklist", () => {
  assert.deepEqual(v.toJsonSchema(v.literal("a")), { const: "a" });
  assert.deepEqual(v.toJsonSchema(v.literal(42)), { const: 42 });
  assert.deepEqual(v.toJsonSchema(v.literal(true)), { const: true });
  assert.deepEqual(v.toJsonSchema(v.literal(null)), { type: "null" });
  assert.deepEqual(v.toJsonSchema(v.picklist(["a", "b"])), {
    type: "string",
    enum: ["a", "b"],
  });
});

test("nullable/nullish/optional wrappers", () => {
  assert.deepEqual(v.toJsonSchema(v.nullable(v.string())), { type: ["string", "null"] });
  assert.deepEqual(v.toJsonSchema(v.nullish(v.string())), { type: ["string", "null"] });
  // optional emits the inner schema; defaults are not a JSON Schema concern
  assert.deepEqual(v.toJsonSchema(v.optional(v.string())), { type: "string" });
  assert.deepEqual(v.toJsonSchema(v.optionalStr(v.string(), "d")), { type: "string" });
  assert.deepEqual(v.toJsonSchema(v.optionalNum(v.number(), 5)), { type: "number" });
  assert.deepEqual(v.toJsonSchema(v.optionalBool(v.boolean(), true)), { type: "boolean" });
  // nullable over an untyped node falls back to anyOf, never a self-reference
  const n = v.toJsonSchema(v.nullable(v.any()));
  assert.deepEqual(n, { anyOf: [{}, { type: "null" }] });
  // nullable over a union appends a null arm
  const u = v.toJsonSchema(v.nullable(v.union([v.string(), v.number()])));
  assert.deepEqual(u.anyOf, [{ type: "string" }, { type: "number" }, { type: "null" }]);
});

test("array and tuple", () => {
  assert.deepEqual(v.toJsonSchema(v.array(v.number())), {
    type: "array",
    items: { type: "number" },
  });
  assert.deepEqual(v.toJsonSchema(v.tuple([v.string(), v.number()])), {
    type: "array",
    prefixItems: [{ type: "string" }, { type: "number" }],
    minItems: 2,
    maxItems: 2,
  });
});

test("object modes: required, optional keys, strictness", () => {
  assert.deepEqual(
    v.toJsonSchema(
      v.object({
        a: v.string(),
        b: v.optional(v.number()),
      }),
    ),
    {
      type: "object",
      properties: { a: { type: "string" }, b: { type: "number" } },
      required: ["a"],
    },
  );
  assert.deepEqual(v.toJsonSchema(v.looseObject({ a: v.string() })), {
    type: "object",
    properties: { a: { type: "string" } },
    required: ["a"],
  });
  assert.deepEqual(v.toJsonSchema(v.strictObject({ a: v.string() })), {
    type: "object",
    properties: { a: { type: "string" } },
    required: ["a"],
    additionalProperties: false,
  });
  // an empty object emits no properties/required keys at all
  assert.deepEqual(v.toJsonSchema(v.object({})), { type: "object" });
});

test("record: additionalProperties and propertyNames", () => {
  assert.deepEqual(v.toJsonSchema(v.record(v.string(), v.number())), {
    type: "object",
    additionalProperties: { type: "number" },
  });
  assert.deepEqual(v.toJsonSchema(v.record(v.picklist(["a", "b"]), v.number())), {
    type: "object",
    additionalProperties: { type: "number" },
    propertyNames: { type: "string", enum: ["a", "b"] },
  });
});

test("union: nullable collapse and anyOf", () => {
  assert.deepEqual(v.toJsonSchema(v.union([v.string(), v.literal(null)])), {
    type: ["string", "null"],
  });
  assert.deepEqual(v.toJsonSchema(v.union([v.string(), v.number()])), {
    anyOf: [{ type: "string" }, { type: "number" }],
  });
  assert.deepEqual(v.toJsonSchema(v.union([v.string(), v.number(), v.literal(null)])), {
    anyOf: [{ type: "string" }, { type: "number" }, { type: "null" }],
  });
});

test("pipe folds length constraints onto the inner type", () => {
  assert.deepEqual(v.toJsonSchema(v.pipe(v.string(), v.minLength(1), v.maxLength(10))), {
    type: "string",
    minLength: 1,
    maxLength: 10,
  });
  assert.deepEqual(v.toJsonSchema(v.pipe(v.string(), v.length(3))), {
    type: "string",
    minLength: 3,
    maxLength: 3,
  });
  assert.deepEqual(v.toJsonSchema(v.pipe(v.string(), v.nonEmpty())), {
    type: "string",
    minLength: 1,
  });
  assert.deepEqual(v.toJsonSchema(v.pipe(v.array(v.string()), v.minLength(1), v.maxLength(5))), {
    type: "array",
    items: { type: "string" },
    minItems: 1,
    maxItems: 5,
  });
});

test("pipe folds string checks", () => {
  assert.deepEqual(v.toJsonSchema(v.pipe(v.string(), v.regex(/^a+$/))), {
    type: "string",
    pattern: "^a+$",
  });
  assert.deepEqual(v.toJsonSchema(v.pipe(v.string(), v.email())), {
    type: "string",
    format: "email",
  });
  assert.deepEqual(v.toJsonSchema(v.pipe(v.string(), v.uuid())), {
    type: "string",
    format: "uuid",
  });
  assert.deepEqual(v.toJsonSchema(v.pipe(v.string(), v.url())), {
    type: "string",
    format: "uri",
  });
  assert.deepEqual(v.toJsonSchema(v.pipe(v.string(), v.ipv4())), {
    type: "string",
    format: "ipv4",
  });
  assert.deepEqual(v.toJsonSchema(v.pipe(v.string(), v.digits())), {
    type: "string",
    pattern: "^\\d+$",
  });
  assert.deepEqual(v.toJsonSchema(v.pipe(v.string(), v.empty())), {
    type: "string",
    maxLength: 0,
  });
  assert.deepEqual(v.toJsonSchema(v.pipe(v.string(), v.startsWith("ab"))), {
    type: "string",
    pattern: "^ab",
  });
  assert.deepEqual(v.toJsonSchema(v.pipe(v.string(), v.endsWith("a.b"))), {
    type: "string",
    pattern: "a\\.b$",
  });
  assert.deepEqual(v.toJsonSchema(v.pipe(v.string(), v.includes("a*b"))), {
    type: "string",
    pattern: "a\\*b",
  });
});

test("pipe folds number checks", () => {
  assert.deepEqual(v.toJsonSchema(v.pipe(v.number(), v.integer())), {
    type: "integer",
  });
  assert.deepEqual(v.toJsonSchema(v.pipe(v.number(), v.minValue(1), v.maxValue(10))), {
    type: "number",
    minimum: 1,
    maximum: 10,
  });
  assert.deepEqual(
    v.toJsonSchema(v.pipe(v.number(), v.gtValue(0), v.ltValue(100), v.multipleOf(3))),
    {
      type: "number",
      exclusiveMinimum: 0,
      exclusiveMaximum: 100,
      multipleOf: 3,
    },
  );
  const safe = v.toJsonSchema(v.pipe(v.number(), v.safeInteger()));
  assert.equal(safe.type, "integer");
  assert.equal(safe.minimum, -(2 ** 53 - 1));
  assert.equal(safe.maximum, 2 ** 53 - 1);
  // finite is skipped: JSON numbers are finite by construction
  assert.deepEqual(v.toJsonSchema(v.pipe(v.number(), v.finite())), { type: "number" });
});

test("transforms and custom checks are skipped gracefully", () => {
  assert.deepEqual(v.toJsonSchema(v.pipe(v.string(), v.trim(), v.toUpperCase())), {
    type: "string",
  });
  // a transform changes the output type; the input node stays accurate
  assert.deepEqual(
    v.toJsonSchema(
      v.pipe(
        v.string(),
        v.transform((s) => s.length),
      ),
    ),
    { type: "string" },
  );
  assert.deepEqual(v.toJsonSchema(v.pipe(v.number(), v.toMinValue(5))), { type: "number" });
  assert.deepEqual(
    v.toJsonSchema(
      v.pipe(
        v.number(),
        v.check((n) => n > 0),
      ),
    ),
    { type: "number" },
  );
  assert.deepEqual(v.toJsonSchema(v.custom((x) => x === "ok")), {});
  // unrepresentable actions never drop the base constraints beside them
  assert.deepEqual(
    v.toJsonSchema(
      v.pipe(
        v.string(),
        v.minLength(2),
        v.check(() => true),
      ),
    ),
    { type: "string", minLength: 2 },
  );
});

test("nested compositions emit recursively", () => {
  const Order = v.strictObject({
    id: v.pipe(v.string(), v.uuid()),
    items: v.pipe(
      v.array(v.strictObject({ qty: v.pipe(v.number(), v.minValue(1)) })),
      v.minLength(1),
    ),
    note: v.optional(v.pipe(v.string(), v.maxLength(200))),
    tags: v.union([v.array(v.string()), v.nullable(v.string())]),
    meta: v.record(v.string(), v.union([v.string(), v.number(), v.literal(null)])),
  });
  assert.deepEqual(v.toJsonSchema(Order), {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid" },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: { qty: { type: "number", minimum: 1 } },
          required: ["qty"],
          additionalProperties: false,
        },
        minItems: 1,
      },
      note: { type: "string", maxLength: 200 },
      tags: {
        anyOf: [{ type: "array", items: { type: "string" } }, { type: ["string", "null"] }],
      },
      meta: {
        type: "object",
        additionalProperties: {
          anyOf: [{ type: "string" }, { type: "number" }, { type: "null" }],
        },
      },
    },
    required: ["id", "items", "tags", "meta"],
    additionalProperties: false,
  });
});

test("toOpenApiSchema matches toJsonSchema (3.1 = 2020-12 superset)", () => {
  const schemas = [
    v.string(),
    v.nullable(v.string()),
    v.union([v.string(), v.number()]),
    v.strictObject({ a: v.optional(v.string()), b: v.nullable(v.number()) }),
    v.pipe(v.array(v.string()), v.minLength(1)),
    v.tuple([v.string(), v.literal(null)]),
    v.record(v.string(), v.picklist(["x"])),
  ];
  for (const s of schemas) {
    assert.deepEqual(v.toOpenApiSchema(s), v.toJsonSchema(s));
  }
});

test("emitted nodes are JSON-serializable records", () => {
  const S = v.strictObject({
    a: v.pipe(v.string(), v.email()),
    b: v.nullable(v.number()),
  });
  const node = v.toJsonSchema(S);
  const round = JSON.parse(JSON.stringify(node));
  assert.deepEqual(round, node);
});
