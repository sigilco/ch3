// scriptc-subset HTML escape helpers (probe)

export function escapeHtmlCharCode(s: string): string {
  let out = "";
  let i = 0;
  const n = s.length;
  while (i < n) {
    const code = s.charCodeAt(i);
    if (code === 38) {
      out = out + "&amp;";
    } else if (code === 60) {
      out = out + "&lt;";
    } else if (code === 62) {
      out = out + "&gt;";
    } else if (code === 34) {
      out = out + "&quot;";
    } else if (code === 39) {
      out = out + "&#39;";
    } else {
      out = out + s.charAt(i);
    }
    i = i + 1;
  }
  return out;
}

export function escapeHtmlSplitJoin(s: string): string {
  let t = s;
  t = t.split("&").join("&amp;");
  t = t.split("<").join("&lt;");
  t = t.split(">").join("&gt;");
  t = t.split('"').join("&quot;");
  t = t.split("'").join("&#39;");
  return t;
}
