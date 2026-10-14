import assert from "node:assert";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createApp } from "../src/app.ts";
import { parseHooks, verifySignature } from "../src/hooks.ts";

const config = JSON.stringify([
  {
    id: "deploy",
    command: "/bin/sh",
    args: ["-c", "echo deploying $HOOK_REF for $HOOK_ID; echo $SECRET_LEAK"],
    secret: "s3cret",
    rules: [{ field: "ref", equals: "refs/heads/main" }],
    env: [{ field: "ref", name: "HOOK_REF" }],
  },
  { id: "fail", command: "/usr/bin/false", args: [], secret: "s3cret", rules: [], env: [] },
]);

const sign = (body: string, secret = "s3cret") =>
  "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

async function withServer(fn: (post: (id: string, body: string, sig?: string) => Promise<Response>) => Promise<void>) {
  const hooks = parseHooks(config);
  assert.ok(hooks);
  const srv = createApp(hooks).serve({ port: 0 });
  await new Promise((r) => srv.on("listening", r));
  const base = "http://127.0.0.1:" + (srv.address() as { port: number }).port;
  try {
    await fn((id, body, sig) =>
      fetch(base + "/hooks/" + id, { method: "POST", body, headers: { "x-hub-signature-256": sig ?? sign(body) } }),
    );
  } finally {
    srv.close();
  }
}

test("verifySignature accepts the right mac and rejects bad ones", () => {
  assert.equal(verifySignature("k", "body", sign("body", "k")), true);
  assert.equal(verifySignature("k", "body", sign("body", "other")), false);
  assert.equal(verifySignature("k", "body", "sha256=abcd"), false);
  assert.equal(verifySignature("k", "body", "sha256=zz"), false);
  assert.equal(verifySignature("k", "body", ""), false);
});

test("config is validated", () => {
  assert.equal(parseHooks('[{"id":"x"}]'), null);
  assert.equal(parseHooks(config)?.length, 2);
});

test("signed matching payload runs the argv with only the mapped env", async () => {
  process.env.SECRET_LEAK = "leaked";
  await withServer(async (post) => {
    const res = await post("deploy", JSON.stringify({ ref: "refs/heads/main" }));
    assert.equal(res.status, 200);
    const j = (await res.json()) as { triggered: boolean; output: string };
    assert.equal(j.triggered, true);
    assert.equal(j.output, "deploying refs/heads/main for deploy\n\n");
  });
});

test("rejections: signature, rules, unknown hook, failing command", async () => {
  await withServer(async (post) => {
    const body = JSON.stringify({ ref: "refs/heads/main" });
    assert.equal((await post("deploy", body, "sha256=" + "0".repeat(64))).status, 401);
    const other = await post("deploy", JSON.stringify({ ref: "refs/heads/dev" }));
    assert.equal(other.status, 202);
    assert.deepEqual(await other.json(), { triggered: false });
    assert.equal((await post("nope", body)).status, 404);
    assert.equal((await post("fail", "{}")).status, 500);
  });
});
