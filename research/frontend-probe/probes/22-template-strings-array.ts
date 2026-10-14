function htmlTsa(strings: TemplateStringsArray, ...values: string[]): string {
  let out = "";
  for (let i = 0; i < strings.length; i++) {
    out = out + strings[i];
    if (i < values.length) {
      out = out + values[i];
    }
  }
  return out;
}

console.log(htmlTsa`Hello ${"Ada"}`);
