// @chttp/html: minimal HTML string rendering authored in the scriptc subset.
// Kita-compatible names where the subset allows; see .agents/notes/2026-10-14-kitajs-api-audit.md.
// Children are pre-rendered markup (like kitajs). Text must go through escapeHtml or the html tag.

// Attribute value sentinel: emit the attribute name bare (boolean attribute).
export const BARE: string = "\u0000";

// Escapes & < " ' (same bytes as kitajs). charCode loop, no regex.
export function escapeHtml(s: string): string {
  let out = "";
  let start = 0;
  const n = s.length;
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    let rep = "";
    if (c === 38) {
      rep = "&amp;";
    } else if (c === 60) {
      rep = "&lt;";
    } else if (c === 34) {
      rep = "&#34;";
    } else if (c === 39) {
      rep = "&#39;";
    }
    if (rep !== "") {
      out += s.slice(start, i) + rep;
      start = i + 1;
    }
  }
  if (start === 0) {
    return s;
  }
  return out + s.slice(start, n);
}

export function isVoidElement(tag: string): boolean {
  return (
    tag === "meta" ||
    tag === "link" ||
    tag === "img" ||
    tag === "br" ||
    tag === "input" ||
    tag === "hr" ||
    tag === "area" ||
    tag === "base" ||
    tag === "col" ||
    tag === "command" ||
    tag === "embed" ||
    tag === "keygen" ||
    tag === "param" ||
    tag === "source" ||
    tag === "track" ||
    tag === "wbr"
  );
}

function isAlpha(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

function isDigit(c: number): boolean {
  return c >= 48 && c <= 57;
}

// [A-Za-z][A-Za-z0-9-]*
export function isValidTag(tag: string): boolean {
  const n = tag.length;
  if (n === 0 || !isAlpha(tag.charCodeAt(0))) {
    return false;
  }
  for (let i = 1; i < n; i++) {
    const c = tag.charCodeAt(i);
    if (!isAlpha(c) && !isDigit(c) && c !== 45) {
      return false;
    }
  }
  return true;
}

// [A-Za-z_:@][A-Za-z0-9_:.@-]* (allows alpine @click, htmx hx-on:click, data-*)
export function isValidAttrName(name: string): boolean {
  const n = name.length;
  if (n === 0) {
    return false;
  }
  const f = name.charCodeAt(0);
  if (!isAlpha(f) && f !== 95 && f !== 58 && f !== 64) {
    return false;
  }
  for (let i = 1; i < n; i++) {
    const c = name.charCodeAt(i);
    if (!isAlpha(c) && !isDigit(c) && c !== 95 && c !== 58 && c !== 46 && c !== 64 && c !== 45) {
      return false;
    }
  }
  return true;
}

function concat(kids: string[]): string {
  let out = "";
  for (let i = 0; i < kids.length; i++) {
    out += kids[i];
  }
  return out;
}

// Renders flat [name, value, name, value, ...] pairs. A `safe` pair is consumed by h, not emitted.
function renderAttrs(attrs: string[]): string {
  let out = "";
  for (let i = 0; i + 1 < attrs.length; i += 2) {
    const name = attrs[i];
    const value = attrs[i + 1];
    if (name === undefined || value === undefined) {
      continue;
    }
    if (name === "safe") {
      continue;
    }
    if (!isValidAttrName(name)) {
      throw new Error("html: invalid attribute name");
    }
    if (value === BARE) {
      out += " " + name;
    } else {
      out += " " + name + '="' + escapeHtml(value) + '"';
    }
  }
  return out;
}

function hasSafe(attrs: string[]): boolean {
  for (let i = 0; i + 1 < attrs.length; i += 2) {
    if (attrs[i] === "safe") {
      return attrs[i + 1] !== "false";
    }
  }
  return false;
}

// Renders one element. attrs is a flat name/value array, kids are pre-rendered markup.
// A `safe` attribute pair escapes the joined kids once (kitajs semantics).
export function h(tag: string, attrs: string[], kids: string[]): string {
  if (!isValidTag(tag)) {
    throw new Error("html: invalid tag name");
  }
  const a = renderAttrs(attrs);
  if (kids.length === 0) {
    if (isVoidElement(tag)) {
      return "<" + tag + a + "/>";
    }
    return "<" + tag + a + "></" + tag + ">";
  }
  let body = concat(kids);
  if (hasSafe(attrs)) {
    body = escapeHtml(body);
  }
  return "<" + tag + a + ">" + body + "</" + tag + ">";
}

// kitajs-shaped alias: Html.createElement(name, attrs, ...children).
export function createElement(name: string, attrs: string[], ...children: string[]): string {
  return h(name, attrs, children);
}

// Multiple siblings without a wrapper element.
export function Fragment(kids: string[]): string {
  return concat(kids);
}

// Tag: escapes interpolations, static template text is trusted markup.
export function html(strings: TemplateStringsArray, ...vals: string[]): string {
  let out = "";
  for (let i = 0; i < strings.length; i++) {
    const s = strings[i];
    if (s !== undefined) {
      out += s;
    }
    if (i < vals.length) {
      const v = vals[i];
      if (v !== undefined) {
        out += escapeHtml(v);
      }
    }
  }
  return out;
}

// Tag: no escaping. Only for composing already-rendered, trusted markup.
export function raw(strings: TemplateStringsArray, ...vals: string[]): string {
  let out = "";
  for (let i = 0; i < strings.length; i++) {
    const s = strings[i];
    if (s !== undefined) {
      out += s;
    }
    if (i < vals.length) {
      const v = vals[i];
      if (v !== undefined) {
        out += v;
      }
    }
  }
  return out;
}
