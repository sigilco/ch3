function row(item: string): string {
  return "<li>" + item.split("<").join("&lt;") + "</li>";
}

function list(items: string[], render: (item: string) => string): string {
  let out = "<ul>";
  for (let i = 0; i < items.length; i++) {
    out += render(String(items[i]));
  }
  return out + "</ul>";
}

const html = list(["a<b>", "c"], row);
if (html !== "<ul><li>a&lt;b></li><li>c</li></ul>") {
  console.log("FAIL callback " + html);
  process.exit(1);
}
console.log("PASS callback-child");
