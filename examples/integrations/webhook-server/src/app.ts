import { createRouter } from "@chttp/router";
import type { Ctx } from "@chttp/router";
import { findHook, rulesMatch, runHook, verifySignature } from "./hooks.ts";
import type { HookDef } from "./hooks.ts";

export function createApp(hooks: HookDef[]) {
  const app = createRouter();

  app.post(
    "/hooks/:id",
    (c: Ctx) => {
      const hook = findHook(hooks, c.req.param("id") || "");
      if (hook === null) return c.status(404).json({ error: "unknown hook" });

      const body = c.req.body();
      if (!verifySignature(hook.secret, body, c.req.header("x-hub-signature-256") || "")) {
        return c.status(401).json({ error: "bad signature" });
      }
      const payload = JSON.parse(body) as Record<string, unknown>;
      if (!rulesMatch(hook, payload)) {
        return c.status(202).json({ triggered: false });
      }
      const r = runHook(hook, payload);
      return c.status(r.ok ? 200 : 500).json({ triggered: true, output: r.output });
    },
    { body: true },
  );

  app.notFound((c) => c.status(404).json({ error: "not found" }));
  return app;
}
