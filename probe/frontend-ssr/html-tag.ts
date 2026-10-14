// Tagged-template HTML builder (no runtime components — strings only)

import { escapeHtmlSplitJoin } from "./html-escape.ts";

export function html(parts: TemplateStringsArray, ...values: string[]): string {
  let out = parts[0];
  let i = 0;
  while (i < values.length) {
    out = out + escapeHtmlSplitJoin(String(values[i])) + parts[i + 1];
    i = i + 1;
  }
  return out;
}

export function page(title: string, body: string): string {
  return html`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;
}
