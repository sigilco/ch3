function escapeRe(s: string): string {
  const t = String(s);
  return t.replace(/[&<>"']/g, function (ch: string): string {
    if (ch === "&") {
      return "&amp;";
    }
    if (ch === "<") {
      return "&lt;";
    }
    if (ch === ">") {
      return "&gt;";
    }
    if (ch === '"') {
      return "&quot;";
    }
    return "&#39;";
  });
}

console.log(escapeRe(`<&"'`));
