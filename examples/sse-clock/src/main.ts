import { createRouter } from "@chttp/router";
import { streamSSE } from "@chttp/stream";

const app = createRouter();

app.get("/", (c) =>
  c.html(
    '<pre id="o"></pre><script>' +
      'new EventSource("/clock").addEventListener("tick",e=>{' +
      'document.getElementById("o").textContent+=e.data+"\\n"})</script>',
  ),
);

// One event per second. The interval dies with the connection.
app.get("/clock", (c) =>
  streamSSE(c, (s) => {
    let n = 0;
    s.retry(3000);
    const t = setInterval(() => {
      n = n + 1;
      s.send("tick " + String(n) + " at " + new Date().toISOString(), "tick", String(n));
    }, 1000);
    s.onAbort(() => {
      clearInterval(t);
      console.log("clock: client left");
    });
  }),
);

app.serve({ port: Number(process.env.PORT ?? 3000) });
