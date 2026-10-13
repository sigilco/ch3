// Raw baseline under Bun.serve — bun cell of the raw-http row.
import { MIXED_STATIC, JSON_BODY, OK_BODY } from "./common.mjs";

const STATIC_SET = new Set(MIXED_STATIC);
const PARAM_SET = new Set<string>();
const WILD_SET = new Set<string>();
for (let i = 0; i < 30; i++) PARAM_SET.add("p" + i);
for (let i = 0; i < 10; i++) WILD_SET.add("w" + i);

const JSON_H = { "content-type": "application/json" };
const TEXT_H = { "content-type": "text/plain" };

function route(url: string, method: string, req: Request): Response {
  if (method === "GET") {
    if (url === "/") return new Response("", { headers: TEXT_H });
    if (url === "/hello") return new Response("Hello World!", { headers: TEXT_H });
    if (url === "/json") return new Response(JSON_BODY, { headers: JSON_H });
    if (url === "/deep/a/b/c/d/e") return new Response(OK_BODY, { headers: JSON_H });
    if (url.startsWith("/user/")) {
      const id = url.slice(6);
      if (id.length > 0 && !id.includes("/"))
        return new Response(JSON.stringify({ id }), { headers: JSON_H });
    }
    if (url.startsWith("/files/")) return new Response(url.slice(7), { headers: TEXT_H });
    if (url.startsWith("/m/")) {
      if (STATIC_SET.has(url)) return new Response(OK_BODY, { headers: JSON_H });
      const rest = url.slice(3);
      const slash = rest.indexOf("/");
      if (slash > 0) {
        const seg = rest.slice(0, slash);
        const tail = rest.slice(slash + 1);
        if (tail.length > 0) {
          if (PARAM_SET.has(seg) && !tail.includes("/"))
            return new Response(OK_BODY, { headers: JSON_H });
          if (WILD_SET.has(seg)) return new Response(OK_BODY, { headers: JSON_H });
        }
      }
    }
  } else if (method === "POST") {
    if (url === "/echo") return new Response(req.body, { headers: TEXT_H });
    if (url === "/user") return new Response("", { headers: TEXT_H });
  }
  return new Response("Not Found", { status: 404, headers: TEXT_H });
}

export default {
  port: 3000,
  fetch(req: Request): Response {
    const url = new URL(req.url);
    return route(url.pathname, req.method, req);
  },
};
