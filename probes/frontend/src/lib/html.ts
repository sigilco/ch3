// Candidate server renderer. Conservative scriptc subset, matching
// packages/router/src: no function-valued records, no `| undefined`,
// no `?.` / `??` / spread / Map / Set, indexed loops, classes for the
// HTML brand only. Every interpolation that goes through `text` is escaped.
// `raw` is the one trusted-string constructor.

export class Html {
  s: string;

  constructor(s: string) {
    this.s = s;
  }
}

export function esc(s: string): string {
  return String(s)
    .split("&")
    .join("&amp;")
    .split("<")
    .join("&lt;")
    .split(">")
    .join("&gt;")
    .split('"')
    .join("&quot;")
    .split("'")
    .join("&#39;");
}

export function text(s: string): Html {
  return new Html(esc(s));
}

export function raw(s: string): Html {
  return new Html(String(s));
}

export function el(tag: string, inner: Html): Html {
  const t = String(tag);
  return new Html("<" + t + ">" + inner.s + "</" + t + ">");
}

export function elAttr(tag: string, attrs: string, inner: Html): Html {
  const t = String(tag);
  return new Html("<" + t + " " + String(attrs) + ">" + inner.s + "</" + t + ">");
}

export function cat(parts: Html[]): Html {
  let s = "";
  for (let i = 0; i < parts.length; i++) {
    s += parts[i].s;
  }
  return new Html(s);
}

export function attr(s: string): string {
  return esc(s);
}
