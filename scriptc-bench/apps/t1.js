import { default as findMyWay } from "find-my-way";
console.log("imported");
const router = findMyWay();
console.log("constructed");
router.get("/json", (req, res) => res.end("{}"));
console.log("route added");
