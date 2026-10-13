// Server smoke: real HTTP round-trips through app.serve() — the test-runner
// path that router.test.js's in-proc dispatch doesn't cover.
import * as assert from "node:assert";
import test from "node:test";
import { createRouter } from "../dist/esm/index.js";

test("serve(): json + param routes over real http", async () => {
  const app = createRouter();
  app.get("/json", (c) => c.json({ hello: "world" }));
  app.get("/user/:id", (c) => c.json({ id: c.req.param("id") }));
  const srv = app.serve({ port: 0 });
  await new Promise((r) => srv.on("listening", r));
  const port = srv.address().port;
  const r1 = await fetch("http://127.0.0.1:" + port + "/json");
  assert.equal(r1.status, 200);
  assert.deepEqual(await r1.json(), { hello: "world" });
  const r2 = await fetch("http://127.0.0.1:" + port + "/user/42");
  assert.deepEqual(await r2.json(), { id: "42" });
  srv.close();
});
