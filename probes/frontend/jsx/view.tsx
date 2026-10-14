export {};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      p: { children?: string };
    }
  }
}

function h(tag: string, props: null, ...kids: string[]): string {
  void props;
  let inner = "";
  for (let i = 0; i < kids.length; i++) {
    inner += String(kids[i]);
  }
  return "<" + tag + ">" + inner + "</" + tag + ">";
}

function Frag(props: null, ...kids: string[]): string {
  void props;
  let inner = "";
  for (let i = 0; i < kids.length; i++) {
    inner += String(kids[i]);
  }
  return inner;
}

const page = <p>hello</p>;
if (page !== "<p>hello</p>") {
  console.log("FAIL jsx " + page);
  process.exit(1);
}
console.log("PASS jsx");
