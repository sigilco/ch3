function esc(s: string): string {
  return String(s).split("<").join("&lt;");
}

type View = {
  render: (name: string) => string;
};

const view: View = {
  render: function (name: string): string {
    return "<p>" + esc(name) + "</p>";
  },
};

const html = view.render("a<b");
if (html !== "<p>a&lt;b</p>") {
  console.log("FAIL fn-record " + html);
  process.exit(1);
}
console.log("PASS fn-record");
