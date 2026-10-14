import { createServer } from "node:http";

const port = Number(process.argv[2] || 18080);
createServer(function (req, res) {
  res.statusCode = 200;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.write("<html>");
  res.write("<body>streamed</body>");
  res.end("</html>");
}).listen(port);
console.log("listening " + String(port));
