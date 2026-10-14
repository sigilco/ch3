// Candidate @chttp/html surface — authored inside the scriptc compilable
// subset. Probes import this file; nothing here is published.

export class Html {
  s: string;
  constructor(s: string) {
    this.s = String(s);
  }
}

export function escapeHtml(s: string): string {
  const t = String(s);
  return t
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

export function escapeAttr(s: string): string {
  return escapeHtml(s);
}

export function escapeHtmlChar(s: string): string {
  const t = String(s);
  let out = "";
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c === 38) {
      out = out + "&amp;";
    } else if (c === 60) {
      out = out + "&lt;";
    } else if (c === 62) {
      out = out + "&gt;";
    } else if (c === 34) {
      out = out + "&quot;";
    } else if (c === 39) {
      out = out + "&#39;";
    } else {
      out = out + t.charAt(i);
    }
  }
  return out;
}

export type Interpolable = string | number | boolean | Html | null;

function stringify(v: Interpolable): string {
  if (v instanceof Html) {
    return v.s;
  }
  if (v === null) {
    return "";
  }
  if (typeof v === "string") {
    return escapeHtml(v);
  }
  if (typeof v === "number") {
    return String(v);
  }
  if (typeof v === "boolean") {
    return v ? "true" : "false";
  }
  return "";
}

export function joinHtml(parts: Html[]): Html {
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    out = out + parts[i].s;
  }
  return new Html(out);
}

export function html(strings: TemplateStringsArray, ...values: Interpolable[]): Html {
  let out = "";
  const n = strings.length;
  for (let i = 0; i < n; i++) {
    out = out + strings[i];
    if (i < values.length) {
      out = out + stringify(values[i]);
    }
  }
  return new Html(out);
}

export function h(tag: string, pairs: string[][], body: string): string {
  let out = "<" + String(tag);
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    out = out + " " + p[0] + '="' + escapeAttr(p[1]) + '"';
  }
  if (body === "") {
    return out + " />";
  }
  return out + ">" + body + "</" + String(tag) + ">";
}

export function raw(s: string): Html {
  return new Html(String(s));
}
