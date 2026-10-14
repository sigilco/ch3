import { escapeHtmlSplitJoin } from "./html-escape.ts";

const RAW = 1;

type Slot = { kind: number; s: string };

export function raw(s: string): Slot {
  return { kind: RAW, s: String(s) };
}

function slotToString(v: string | Slot): string {
  if (typeof v === "string") {
    return escapeHtmlSplitJoin(v);
  }
  if (v.kind === RAW) {
    return v.s;
  }
  return "";
}

export function html(parts: TemplateStringsArray, ...values: Array<string | Slot>): string {
  let out = parts[0];
  let i = 0;
  while (i < values.length) {
    out = out + slotToString(values[i]) + parts[i + 1];
    i = i + 1;
  }
  return out;
}
