import { createRouter } from "@chttp/router";

const app = createRouter();

const api = createRouter();
api.get("/health", (c) => c.json({ ok: true }));
api.get("/deep/:id", (c) => c.json({ deep: c.req.param("id") }));
app.route("/api", api);

const admin = createRouter();
admin.get("/stats", (c) => c.json({ users: 0 }));
app.route("/admin", admin);

app.serve({ port: 3000 });
