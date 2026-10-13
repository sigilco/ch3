// chttp POST subject with body buffering but no parse — the floor for the
// validation-cost comparison (buffer only, respond 200).
import { createRouter } from "../../packages/chttp/src/index.ts";

const app = createRouter();

app.get("/json", (c) => c.json({ hello: "world" }));

app.post("/order", (c) => c.json({ ok: true }), { body: true });

app.serve({ port: Number(process.argv[2] || 3000) });
