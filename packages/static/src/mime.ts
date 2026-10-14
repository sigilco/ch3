// Extension (dot-prefixed so `constructor` never hits the prototype) to Content-Type. Plain record. Presence is tested with `in`: a
// missing-key read throws at runtime in a scriptc binary (no undefined slot).
const TYPES: { [k: string]: string } = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
  ".pdf": "application/pdf",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

// Lowercased extension without the dot, "" when the last segment has none.
export function extOf(path: string): string {
  const slash = path.lastIndexOf("/");
  const base = slash === -1 ? path : path.slice(slash + 1);
  const dot = base.lastIndexOf(".");
  if (dot === -1) {
    return "";
  }
  return base.slice(dot + 1).toLowerCase();
}

export function mimeFor(path: string): string {
  const k = "." + extOf(path);
  if (!(k in TYPES)) {
    return "application/octet-stream";
  }
  return TYPES[k];
}
