// @chttp/stream compile gate: SSE + chunked text, same helpers the sse-clock
// example uses. `scriptc coverage bench/apps/chttp-stream.ts` must stay 100%.
import { createRouter } from "../../packages/router/src/index.ts";
import { streamSSE, streamText } from "../../packages/stream/src/index.ts";

const app = createRouter();

app.get("/clock", (c) =>
  streamSSE(c, (s) => {
    let n = 0;
    s.retry(2000);
    s.comment("hello");
    const t = setInterval(() => {
      n = n + 1;
      s.send("tick " + String(n), "tick", String(n));
      if (n >= 3) {
        s.send("line one\nline two");
        s.close();
      }
    }, 200);
    s.onAbort(() => {
      clearInterval(t);
      console.log("clock: closed");
    });
  }),
);

app.get("/text", (c) =>
  streamText(c, (s) => {
    s.write("a");
    s.writeln("b");
    s.close();
  }),
);

app.serve({ port: Number(process.env.PORT ?? 3000) });
