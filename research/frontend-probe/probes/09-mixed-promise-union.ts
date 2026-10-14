function syncPart(): string {
  return "<header>ok</header>";
}

async function asyncPart(): Promise<string> {
  return "<main>ok</main>";
}

function child(kind: number): string | Promise<string> {
  if (kind === 0) {
    return syncPart();
  }
  return asyncPart();
}

async function page(): Promise<string> {
  const a = child(0);
  const b = child(1);
  return String(a) + String(b);
}

const s = await page();
console.log(s);
