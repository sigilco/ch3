// Node-only JSX automatic runtime for dev and tests: `jsxImportSource: "@chttp/html"`.
// NOT scriptc subset (objects, unions, any): never import this from code that compiles to the ELF.
// Production lowers .tsx at build time (unplugin jsx slice). Output is produced by h(), so it is
// byte-identical to hand-written h() trees.
import { BARE, Fragment as fragment, h } from "./index.js";

export type Child = string | number | boolean | null | undefined | Child[];
export type Props = { children?: Child; [k: string]: unknown };

function flatten(c: Child, out: string[]): void {
  if (Array.isArray(c)) {
    for (const x of c) {
      flatten(x, out);
    }
  } else if (typeof c === "string") {
    out.push(c);
  } else if (typeof c === "number") {
    out.push(String(c));
  }
  // null, undefined, booleans render nothing
}

function attrsOf(props: Props): string[] {
  const attrs: string[] = [];
  for (const key of Object.keys(props)) {
    if (key === "children" || key === "key") {
      continue;
    }
    const v = props[key];
    const name = key === "className" ? "class" : key;
    if (v === true) {
      attrs.push(name, name === "safe" ? "true" : BARE);
    } else if (typeof v === "string") {
      attrs.push(name, v);
    } else if (typeof v === "number") {
      attrs.push(name, String(v));
    }
  }
  return attrs;
}

export function jsx(name: string | ((props: Props) => string), props: Props): string {
  if (typeof name === "function") {
    return name(props);
  }
  const kids: string[] = [];
  flatten(props.children, kids);
  return h(name, attrsOf(props), kids);
}

export const jsxs = jsx;
export const jsxDEV = jsx;

export function Fragment(props: Props): string {
  const kids: string[] = [];
  flatten(props.children, kids);
  return fragment(kids);
}

export namespace JSX {
  export type Element = string;
  export interface IntrinsicElements {
    [tag: string]: Record<string, unknown>;
  }
  export interface ElementChildrenAttribute {
    children: {};
  }
}
