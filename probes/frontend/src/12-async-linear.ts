async function loadName(): Promise<string> {
  return "a<b";
}

async function page(): Promise<string> {
  const name = await loadName();
  return "<p>" + name.split("<").join("&lt;") + "</p>";
}

const html = await page();
if (html !== "<p>a&lt;b</p>") {
  console.log("FAIL async-linear " + html);
  process.exit(1);
}
console.log("PASS async-linear");
