import { default as polka } from "polka";

const json = (res, obj) => {
  res.statusCode = 200;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(obj));
};

const app = polka();

app.get("/json", (req, res) => json(res, { ok: true, value: 1 }));
app.get("/user/:id", (req, res) => json(res, { id: req.params.id }));
app.post("/echo", (req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    res.statusCode = 200;
    res.setHeader("content-type", req.headers["content-type"] || "application/octet-stream");
    res.end(body);
  });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`polka listening on ${port}`));
