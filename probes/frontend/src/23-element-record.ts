type Elem = {
  type: (label: string) => string;
  label: string;
};

function render(el: Elem): string {
  return el.type(el.label);
}

const el: Elem = {
  type: function (label: string): string {
    return "<p>" + label.split("<").join("&lt;") + "</p>";
  },
  label: "a<b",
};

const html = render(el);
if (html !== "<p>a&lt;b</p>") {
  console.log("FAIL element-record " + html);
  process.exit(1);
}
console.log("PASS element-record");
