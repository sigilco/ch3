import { createRouter } from "@chttp/router";

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Load shedding: at most maxInflight requests run at once, the rest get a fast
// 503 + Retry-After instead of queueing until memory or latency blows up.
// Oversize bodies are refused with 413 from the Content-Length header.
export function buildApp(maxInflight: number, maxBodyBytes: number, slowMs: number) {
  const app = createRouter();
  const state = { inflight: 0 };

  app.use(async (c, next) => {
    const len = c.req.header("content-length");
    if (len !== null && Number(len) > maxBodyBytes) {
      c.status(413).json({ error: "payload too large", max: maxBodyBytes });
      return;
    }
    if (state.inflight >= maxInflight) {
      c.header("Retry-After", "1");
      c.status(503).json({ error: "overloaded" });
      return;
    }
    state.inflight = state.inflight + 1;
    try {
      await next();
    } catch (e) {
      state.inflight = state.inflight - 1;
      throw e;
    }
    state.inflight = state.inflight - 1;
  });

  // Stands in for a slow upstream call: the request stays in flight.
  app.get("/slow", async (c) => {
    await sleep(slowMs);
    c.text("done");
  });
  app.post("/echo", (c) => c.text(c.req.body()), { body: true });
  return app;
}
