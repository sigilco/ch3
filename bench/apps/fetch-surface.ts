// Fetch-surface scriptc gate: exercises the app.fetch dispatch path
// in an ELF via app.fetchShim (`new Request` is unconstructable under
// scriptc, so the WHATWG entry cannot boot here). Node server in,
// fetchShim (method/url/headers/body primitives) out.
//
// Covered by scripts/scriptc-gate.sh; serves 200s under scriptc 0.3.3
// including c.set/c.get, append headers and middleware.

import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRouter } from "../../packages/router/src/index.ts";

const app = createRouter();

app.use("*", (c, next) => {
  c.header("x-power", "gate");
  next();
});

app.get("/json", (c) => c.json({ hello: "world" }));
app.get("/user/:id", (c) => c.json({ id: c.req.param("id") }));
app.get("/vars", (c) => {
  c.set("user", { id: 1, name: "ada" });
  const u = c.get<{ id: number; name: string }>("user");
  return c.json({ user: u });
});
app.get("/cookies", (c) => {
  c.header("set-cookie", "a=1", { append: true });
  c.header("set-cookie", "b=2", { append: true });
  return c.text("ok");
});
app.post("/echo", (c) => c.text(c.req.body()));

const srv = createServer(function (req: IncomingMessage, res: ServerResponse): void {
  const body = "";
  app.fetchShim(
    String(req.method || "GET"),
    String(req.url || "/"),
    null,
    body,
    function (status: number, hdrList: string[], out: string): void {
      res.statusCode = status;
      for (let i = 0; i + 1 < hdrList.length; i += 2) {
        res.setHeader(String(hdrList[i]), String(hdrList[i + 1]));
      }
      res.end(out);
    },
  );
});

srv.listen(3000, function (): void {
  console.log("fetch-surface listening :3000");
});
