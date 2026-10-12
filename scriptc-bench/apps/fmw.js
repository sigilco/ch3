import { createServer } from "node:http";
import findMyWay from "find-my-way";

const router = findMyWay();

const json = (res, obj) => {
  res.statusCode = 200;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(obj));
};

router.get("/json", (req, res) => json(res, { ok: true, value: 1 }));
router.get("/user/:id", (req, res, params) => json(res, { id: params.id }));
router.post("/echo", (req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    res.statusCode = 200;
    res.setHeader("content-type", req.headers["content-type"] || "application/octet-stream");
    res.end(body);
  });
});

const server = createServer((req, res) => router.lookup(req, res));
const port = Number(process.env.PORT || 3000);
server.listen(port, () => console.log(`find-my-way listening on ${port}`));
