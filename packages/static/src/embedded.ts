import { AssetSource } from "./asset.ts";
import type { Asset } from "./asset.ts";

// Baked record shapes. A generated module (unplugin `assets` slice) ships a
// JSON array of these: the subset cannot index a string-keyed JSON object,
// so assets are an array of records, never a path-keyed object.
export interface EmbedEnc {
  enc: string;
  b64: string;
  etag: string;
}

export interface EmbedRecord {
  path: string;
  type: string;
  b64: string;
  etag: string;
  mtimeMs: number;
  immutable: boolean;
  encs: EmbedEnc[];
}

// Source whose bytes live inside the program. The generated subclass calls
// `load(records)` from its constructor with the baked array; hand-written
// code may use `add()` directly. Lookup is a path index into parallel arrays.
export class EmbeddedAssets extends AssetSource {
  _idx: { [k: string]: number };
  _assets: Asset[];

  constructor() {
    super();
    this._idx = {};
    this._assets = [];
  }

  add(path: string, asset: Asset): void {
    const key = "/" + path;
    if (key in this._idx) {
      this._assets[this._idx[key]] = asset;
    } else {
      this._idx[key] = this._assets.length;
      this._assets.push(asset);
    }
  }

  load(records: EmbedRecord[]): void {
    for (let i = 0; i < records.length; i++) {
      const r: EmbedRecord = records[i];
      const body = Buffer.from(r.b64, "base64");
      const asset: Asset = {
        body: body,
        type: r.type,
        etag: r.etag,
        size: body.length,
        mtimeMs: r.mtimeMs,
        immutable: r.immutable,
        encodings: [],
      };
      for (let j = 0; j < r.encs.length; j++) {
        const e: EmbedEnc = r.encs[j];
        asset.encodings.push({ enc: e.enc, body: Buffer.from(e.b64, "base64"), etag: e.etag });
      }
      this.add(r.path, asset);
    }
  }

  get(path: string): Asset | null {
    const key = "/" + path;
    if (!(key in this._idx)) {
      return null;
    }
    return this._assets[this._idx[key]];
  }
}
