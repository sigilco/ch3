async function part(s: string): Promise<string> {
  return "<li>" + s + "</li>";
}

async function page(): Promise<string> {
  const jobs: Promise<string>[] = [part("a"), part("b")];
  const parts = await Promise.all(jobs);
  let out = "<ul>";
  for (let i = 0; i < parts.length; i++) {
    out += parts[i];
  }
  return out + "</ul>";
}

const html = await page();
if (html !== "<ul><li>a</li><li>b</li></ul>") {
  console.log("FAIL promise-all " + html);
  process.exit(1);
}
console.log("PASS promise-all");
