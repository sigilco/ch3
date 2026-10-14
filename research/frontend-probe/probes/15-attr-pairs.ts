import { h } from "../lib/html.ts";

const s = h("a", [["href", "/x"], ["class", "btn"]], "Open");
console.log(s);
