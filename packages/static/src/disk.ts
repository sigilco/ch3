import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import type { Stats } from "node:fs";
import { AssetSource, isHashedName } from "./asset.ts";
import type { Asset, AssetVariant } from "./asset.ts";
import { mimeFor } from "./mime.ts";

function sha1hex(b: Buffer): string {
  return createHash("sha1").update(b).digest("hex");
}

// True when a root-relative path could leave the root or is not a plain
// relative path. Defence in depth: serveStatic already guards.
function unsafe(path: string): boolean {
  if (path.length === 0 || path.charAt(0) === "/") {
    return true;
  }
  if (path.indexOf("\\") !== -1 || path.indexOf("\0") !== -1) {
    return true;
  }
  const segs = path.split("/");
  for (let i = 0; i < segs.length; i++) {
    if (segs[i] === "..") {
      return true;
    }
  }
  return false;
}

// Filesystem-backed source. Each file is stat'ed on every get (cheap) and
// re-read only when its mtime or size changed, so edits show up without a
// restart. Entries live in parallel arrays indexed through `_idx`; the SHA-1
// ETag is computed lazily on first request of a path, not at startup. Keys
// are prefixed with "/" so names like `constructor` never hit the record
// prototype.
export class DiskAssets extends AssetSource {
  root: string;
  _idx: { [k: string]: number };
  _assets: Asset[];
  _mtimes: number[];
  _sizes: number[];

  constructor(root: string) {
    super();
    this.root =
      root.length > 1 && root.charAt(root.length - 1) === "/"
        ? root.slice(0, root.length - 1)
        : root;
    this._idx = {};
    this._assets = [];
    this._mtimes = [];
    this._sizes = [];
  }

  get(path: string): Asset | null {
    if (unsafe(path)) {
      return null;
    }
    const full = this.root + "/" + path;
    let st: Stats;
    try {
      st = statSync(full);
    } catch (_e) {
      return null;
    }
    if (!st.isFile()) {
      return null;
    }
    const key = "/" + path;
    const known = key in this._idx;
    const slot = known ? this._idx[key] : -1;
    if (known) {
      if (this._mtimes[slot] === st.mtimeMs && this._sizes[slot] === st.size) {
        return this._assets[slot];
      }
    }
    let body: Buffer;
    try {
      body = readFileSync(full);
    } catch (_e2) {
      return null;
    }
    const asset: Asset = {
      body: body,
      type: mimeFor(path),
      etag: sha1hex(body),
      size: body.length,
      mtimeMs: st.mtimeMs,
      immutable: isHashedName(path),
      encodings: this._variants(full),
    };
    if (!known) {
      this._idx[key] = this._assets.length;
      this._assets.push(asset);
      this._mtimes.push(st.mtimeMs);
      this._sizes.push(st.size);
    } else {
      this._assets[slot] = asset;
      this._mtimes[slot] = st.mtimeMs;
      this._sizes[slot] = st.size;
    }
    return asset;
  }

  // Precompressed siblings next to the file: `x.js.br`, `x.js.gz`.
  _variants(full: string): AssetVariant[] {
    const out: AssetVariant[] = [];
    const sufs = [".br", ".gz"];
    const encs = ["br", "gzip"];
    for (let i = 0; i < sufs.length; i++) {
      try {
        const b = readFileSync(full + sufs[i]);
        out.push({ enc: encs[i], body: b, etag: sha1hex(b) });
      } catch (_e) {
        // no sibling for this coding
      }
    }
    return out;
  }
}
