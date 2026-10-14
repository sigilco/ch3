// Asset model and the AssetSource port. Strategies are subclasses (the
// GenDispatch pattern), never records of functions: DiskAssets reads the
// filesystem, EmbeddedAssets holds bytes baked into the program.

// One precompressed sibling of an asset (`app.js.br`, `app.js.gz`).
// `enc` is the content-coding token: "br" or "gzip".
export interface AssetVariant {
  enc: string;
  body: Buffer;
  // Opaque entity tag without quotes. Distinct per coding so caches never
  // mix a brotli body with the identity one.
  etag: string;
}

export interface Asset {
  body: Buffer;
  type: string;
  // Opaque entity tag without quotes; serveStatic adds the quotes.
  etag: string;
  size: number;
  // Last modification time in epoch ms, 0 when unknown (no Last-Modified).
  mtimeMs: number;
  // True for content-hashed filenames: safe for max-age=31536000, immutable.
  immutable: boolean;
  encodings: AssetVariant[];
}

// Port: `path` is a decoded, root-relative path with no leading slash
// ("index.html", "assets/app-Ab3dE9fG.js"). Returns null when absent.
export class AssetSource {
  get(path: string): Asset | null {
    return null;
  }
}

// Content-hashed filename heuristic: the last `-` or `.` separated token of
// the stem is 8 to 32 alphanumerics and mixes letters with digits
// (`app-Ab3dE9fG.js`, `chunk.3f9a1c2e.css`). Pure-numeric tokens such as
// dates do not count. Check on the stem, extension excluded.
export function isHashedName(path: string): boolean {
  const slash = path.lastIndexOf("/");
  const base = slash === -1 ? path : path.slice(slash + 1);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) {
    return false;
  }
  const stem = base.slice(0, dot);
  let cut = stem.lastIndexOf("-");
  const cut2 = stem.lastIndexOf(".");
  if (cut2 > cut) {
    cut = cut2;
  }
  if (cut === -1) {
    return false;
  }
  const tok = stem.slice(cut + 1);
  if (tok.length < 8 || tok.length > 32) {
    return false;
  }
  let digits = false;
  let letters = false;
  for (let i = 0; i < tok.length; i++) {
    const ch = tok.charCodeAt(i);
    if (ch >= 48 && ch <= 57) {
      digits = true;
    } else if ((ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122)) {
      letters = true;
    } else if (ch !== 95) {
      return false;
    }
  }
  return digits && letters;
}
