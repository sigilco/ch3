import { home } from "./gen/home.ts";

const html = home("A<B>", "x");
if (html !== "<h1>A&lt;B&gt;</h1><p>Hello x</p>") {
  console.log("FAIL lowered " + html);
  process.exit(1);
}
console.log("PASS lowered");
