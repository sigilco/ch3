const RE = /[&<>"']/g;

function escSplit(s: string): string {
  return s
    .split("&")
    .join("&amp;")
    .split("<")
    .join("&lt;")
    .split(">")
    .join("&gt;")
    .split('"')
    .join("&quot;")
    .split("'")
    .join("&#39;");
}

function escChar(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 38) {
      out += "&amp;";
    } else if (c === 60) {
      out += "&lt;";
    } else if (c === 62) {
      out += "&gt;";
    } else if (c === 34) {
      out += "&quot;";
    } else if (c === 39) {
      out += "&#39;";
    } else {
      out += s.charAt(i);
    }
  }
  return out;
}

function escRegex(s: string): string {
  return s.replace(RE, function (ch: string): string {
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

const sample = "Hello <world> & \"friends\" it's a test. ".repeat(40);
const want = escSplit(sample);
if (escChar(sample) !== want || escRegex(sample) !== want) {
  console.log("FAIL bench mismatch");
  process.exit(1);
}

function bench(name: string, fn: (s: string) => string): void {
  let n = 0;
  const t0 = Date.now();
  for (let i = 0; i < 20000; i++) {
    n += fn(sample).length;
  }
  const t1 = Date.now();
  console.log(name + " ms=" + String(t1 - t0) + " n=" + String(n));
}

bench("split", escSplit);
bench("char", escChar);
bench("regex", escRegex);
