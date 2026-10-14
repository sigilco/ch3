function escapeRa(s: string): string {
  const t = String(s);
  return t
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

console.log(escapeRa(`<&"'`));
