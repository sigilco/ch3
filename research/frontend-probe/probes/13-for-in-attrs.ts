const attrs: { [k: string]: string } = { id: "n", class: "x" };
let out = "";
for (const k in attrs) {
  out = out + " " + k + "=" + attrs[k];
}
console.log(out);
