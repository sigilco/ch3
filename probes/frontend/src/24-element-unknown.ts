type Elem = {
  type: (props: unknown) => string;
  props: unknown;
};

function render(el: Elem): string {
  return el.type(el.props);
}

const el: Elem = {
  type: function (props: unknown): string {
    if (typeof props === "string") {
      return "<p>" + props + "</p>";
    }
    return "<p></p>";
  },
  props: "a",
};

const html = render(el);
if (html !== "<p>a</p>") {
  console.log("FAIL element-unknown " + html);
  process.exit(1);
}
console.log("PASS element-unknown");
