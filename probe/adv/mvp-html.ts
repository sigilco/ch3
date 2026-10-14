// Subset HTML builder. Escapes text by default. Sync only.

export function esc(s: string): string {
  let t = String(s);
  t = t.split("&").join("&amp;");
  t = t.split("<").join("&lt;");
  t = t.split(">").join("&gt;");
  t = t.split('"').join("&quot;");
  return t;
}

export function el(tag: string, inner: string): string {
  return "<" + tag + ">" + inner + "</" + tag + ">";
}

export function page(title: string, body: string): string {
  return (
    "<!doctype html><html><head><meta charset=\"utf-8\"><title>" +
    esc(title) +
    "</title></head>" +
    body +
    "</html>"
  );
}
