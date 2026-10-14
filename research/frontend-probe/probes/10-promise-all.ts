async function part(s: string): Promise<string> {
  return "<x>" + s + "</x>";
}

async function page(): Promise<string> {
  const jobs: Promise<string>[] = [part("a"), part("b"), part("c")];
  const parts = await Promise.all(jobs);
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    out = out + parts[i];
  }
  return out;
}

const s = await page();
console.log(s);
