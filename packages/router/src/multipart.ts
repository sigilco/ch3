// chttp — multipart/form-data parsing, authored in the scriptc subset.
//
// Hono and H3 both delegate multipart to the runtime's Request.formData();
// chttp sits on raw node:http compiled through scriptc, so there is no
// runtime parser to delegate to — like multer, chttp owns the bytes. The
// API shape borrows Hono's ergonomics: opt-in per route, sync access in
// the handler, storage strategy declared on the route.
//
// Parser model: a byte-level boundary state machine fed Uint8Array chunks
// (req.on("data") on the Node path, req.arrayBuffer() on app.fetch). File
// parts stream straight into a MultipartFileSink — memory chunks or an
// open fd — so a 3 GB upload never lands in RAM. Limits are enforced
// while bytes arrive, not after: crossing maxFileBytes/maxFiles/
// maxFieldBytes aborts the parse immediately (err = 2) and dispatch
// answers 413.
//
// Subset notes: `| null` unions only, indexed loops, charCodeAt (never
// s[i]), Uint8Array slices/copies by hand, decode via
// Buffer.from(u8).toString("utf8") — typed-array .toString() is SC2020.

import { openSync, writeSync, closeSync, unlinkSync, mkdirSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// UploadedFile + storage port
// ---------------------------------------------------------------------------

export class UploadedFile {
  // The form field name this file arrived under.
  field: string;
  // Client-sent filename, basename-sanitized ("../../etc/passwd" ->
  // "passwd"). Empty string when the client sent filename="".
  filename: string;
  // Part Content-Type; "application/octet-stream" when absent.
  mimeType: string;
  // Bytes written (file parts) — the on-disk / in-memory byte count.
  size: number;
  // Disk storage: absolute path of the temp file. null for memory storage.
  path: string | null;
  // Memory storage: the file's bytes. null for disk storage.
  bytes: Uint8Array | null;

  constructor(
    field: string,
    filename: string,
    mimeType: string,
    size: number,
    path: string | null,
    bytes: Uint8Array | null,
  ) {
    this.field = String(field);
    this.filename = String(filename);
    this.mimeType = String(mimeType);
    this.size = Number(size);
    this.path = path;
    this.bytes = bytes;
  }
}

// Storage port — a base class with no-op methods that concrete strategies
// subclass (scriptc refuses abstract methods; subclass override dispatch is
// the verified GenDispatch/ResponseSink pattern). begin() is called once per
// file part; the returned sink receives the part's bytes in arrival order.
export class MultipartFileSink {
  write(_b: Uint8Array): void {}
  // Normal close: the part ended cleanly at its boundary.
  end(): void {}
  // The parse aborted (limit breach or malformed tail) mid-part: drop any
  // partial output (disk sinks close the fd and unlink the temp file).
  abort(): void {}
  file(): UploadedFile | null {
    return null;
  }
}

export class MultipartStorage {
  begin(_field: string, _filename: string, _mime: string): MultipartFileSink {
    return new MultipartFileSink();
  }
}

// Buffers the part into memory. `file.bytes` carries the content.
export class MemoryFileSink extends MultipartFileSink {
  _field: string;
  _filename: string;
  _mime: string;
  _chunks: Uint8Array[];
  _size: number;

  constructor(field: string, filename: string, mime: string) {
    super();
    this._field = String(field);
    this._filename = String(filename);
    this._mime = String(mime);
    this._chunks = [];
    this._size = 0;
  }

  write(b: Uint8Array): void {
    this._chunks.push(b);
    this._size = this._size + b.length;
  }

  file(): UploadedFile | null {
    return new UploadedFile(
      this._field,
      this._filename,
      this._mime,
      this._size,
      null,
      u8catAll(this._chunks),
    );
  }
}

export class MemoryStorage extends MultipartStorage {
  begin(field: string, filename: string, mime: string): MultipartFileSink {
    return new MemoryFileSink(field, filename, mime);
  }
}

// Streams the part into a temp file under `dir`. `file.path` carries the
// destination; the file is unlinked if the parse aborts mid-part. The
// directory is created (recursively) at registration.
export class DiskFileSink extends MultipartFileSink {
  _field: string;
  _filename: string;
  _mime: string;
  _path: string;
  _fd: number;
  _size: number;
  _open: boolean;

  constructor(path: string, field: string, filename: string, mime: string) {
    super();
    this._field = String(field);
    this._filename = String(filename);
    this._mime = String(mime);
    this._path = String(path);
    this._size = 0;
    this._fd = openSync(this._path, "w");
    this._open = true;
  }

  write(b: Uint8Array): void {
    // Buffer.from(u8) copies — keeps the writeSync arg shape concrete so the
    // fs lowering applies on both the Node (Buffer) and fetch (Uint8Array)
    // chunk paths.
    writeSync(this._fd, Buffer.from(b));
    this._size = this._size + b.length;
  }

  end(): void {
    if (this._open) {
      this._open = false;
      try {
        closeSync(this._fd);
      } catch (e) {
        // fd already gone
      }
    }
  }

  abort(): void {
    if (this._open) {
      this._open = false;
      try {
        closeSync(this._fd);
      } catch (e) {
        // fd already gone
      }
    }
    try {
      unlinkSync(this._path);
    } catch (e) {
      // nothing on disk to remove
    }
  }

  file(): UploadedFile | null {
    return new UploadedFile(this._field, this._filename, this._mime, this._size, this._path, null);
  }
}

export class DiskStorage extends MultipartStorage {
  dir: string;
  _n: number;

  constructor(dir: string) {
    super();
    let d = String(dir);
    if (d.length > 1 && d.charAt(d.length - 1) === "/") {
      d = d.slice(0, d.length - 1);
    }
    this.dir = d;
    this._n = 0;
    if (!existsSync(d)) {
      mkdirSync(d, { recursive: true });
    }
  }

  begin(field: string, filename: string, mime: string): MultipartFileSink {
    this._n = this._n + 1;
    const stamp = randomBytes(6).toString("hex");
    const path = this.dir + "/chttp-" + String(Date.now()) + "-" + stamp + "-" + String(this._n);
    return new DiskFileSink(path, field, filename, mime);
  }
}

export function memoryStorage(): MultipartStorage {
  return new MemoryStorage();
}

export function diskStorage(dir: string): MultipartStorage {
  return new DiskStorage(dir);
}

// ---------------------------------------------------------------------------
// Byte helpers
// ---------------------------------------------------------------------------

const EMPTY_U8 = new Uint8Array(0);

function u8slice(b: Uint8Array, from: number, to: number): Uint8Array {
  const n = to - from;
  const out = new Uint8Array(n > 0 ? n : 0);
  for (let i = 0; i < out.length; i++) {
    out[i] = b[from + i];
  }
  return out;
}

function u8cat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  for (let i = 0; i < a.length; i++) {
    out[i] = a[i];
  }
  for (let i = 0; i < b.length; i++) {
    out[a.length + i] = b[i];
  }
  return out;
}

function u8catAll(parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (let i = 0; i < parts.length; i++) {
    n = n + parts[i].length;
  }
  const out = new Uint8Array(n);
  let off = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    for (let j = 0; j < p.length; j++) {
      out[off + j] = p[j];
    }
    off = off + p.length;
  }
  return out;
}

// Decode utf8. Typed-array .toString() is SC2020 — Buffer.from is the
// lowered conversion.
function u8str(b: Uint8Array): string {
  return Buffer.from(b).toString("utf8");
}

// Find ASCII needle inside hay at/after `from`. The needle is always a
// boundary marker or CRLFCRLF — pure ASCII, compared via charCodeAt.
// O(n*m) worst case with an n of ≤~80; first-byte skip keeps the common
// scan near O(n).
function findSeq(hay: Uint8Array, needle: string, from: number): number {
  const n = needle.length;
  if (n === 0) {
    return -1;
  }
  const c0 = needle.charCodeAt(0);
  const end = hay.length - n;
  for (let i = from; i <= end; i++) {
    if (hay[i] === c0) {
      let j = 1;
      while (j < n && hay[i + j] === needle.charCodeAt(j)) {
        j = j + 1;
      }
      if (j === n) {
        return i;
      }
    }
  }
  return -1;
}

// ASCII whitespace trim (space + tab) — String.trim is not in the subset.
function trimWs(s: string): string {
  const b = String(s);
  let a = 0;
  let z = b.length;
  while (a < z && (b.charCodeAt(a) === 32 || b.charCodeAt(a) === 9)) {
    a = a + 1;
  }
  while (z > a && (b.charCodeAt(z - 1) === 32 || b.charCodeAt(z - 1) === 9)) {
    z = z - 1;
  }
  return b.slice(a, z);
}

// ---------------------------------------------------------------------------
// Header grammar
// ---------------------------------------------------------------------------

// Extract the boundary parameter from a Content-Type value. Returns null
// when the value is not multipart/form-data or carries no boundary.
export function multipartBoundary(ct: string | null): string | null {
  if (ct === null) {
    return null;
  }
  const s = String(ct);
  const lc = s.toLowerCase();
  if (lc.indexOf("multipart/form-data") !== 0) {
    return null;
  }
  const parts = s.split(";");
  for (let i = 1; i < parts.length; i++) {
    const seg = String(parts[i]);
    const eq = seg.indexOf("=");
    if (eq < 0) {
      continue;
    }
    const k = trimWs(seg.slice(0, eq)).toLowerCase();
    if (k === "boundary") {
      let v = trimWs(seg.slice(eq + 1));
      if (v.length >= 2 && v.charAt(0) === '"' && v.charAt(v.length - 1) === '"') {
        v = v.slice(1, v.length - 1);
      }
      if (v.length === 0) {
        return null;
      }
      return v;
    }
  }
  return null;
}

// Last path component — strips `/`, `\`, and drive-letter prefixes so a
// hostile or Windows-originated filename can never escape the temp dir.
function basename(p: string): string {
  const s = String(p);
  let cut = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    if (ch === 47 || ch === 92 || ch === 58) {
      cut = i;
    }
  }
  return s.slice(cut + 1);
}

// Split a header parameter list on ';' — semicolons inside a quoted-string
// do not split (filename="a;b.txt"). Returns trimmed raw segments.
function splitParams(v: string): string[] {
  const out: string[] = [];
  const s = String(v);
  let cur = "";
  let inQ = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    if (ch === 34) {
      inQ = !inQ;
      cur = cur + s.charAt(i);
    } else if (ch === 59 && !inQ) {
      out.push(cur);
      cur = "";
    } else if (ch === 92 && inQ && i + 1 < s.length) {
      // quoted-pair: keep the escaped char verbatim
      i = i + 1;
      cur = cur + s.charAt(i);
    } else {
      cur = cur + s.charAt(i);
    }
  }
  out.push(cur);
  return out;
}

// name / filename out of a Content-Disposition value. filename* (RFC 5987)
// is intentionally not resolved — clients that send it also send a plain
// filename fallback or nothing.
export class DispositionParams {
  formData: boolean;
  name: string | null;
  filename: string | null;

  constructor() {
    this.formData = false;
    this.name = null;
    this.filename = null;
  }
}

function unquote(v: string): string {
  const s = trimWs(v);
  if (s.length >= 2 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') {
    return s.slice(1, s.length - 1);
  }
  return s;
}

function parseDisposition(v: string): DispositionParams {
  const out = new DispositionParams();
  const segs = splitParams(v);
  for (let i = 0; i < segs.length; i++) {
    const seg = trimWs(String(segs[i]));
    if (i === 0) {
      out.formData = seg.toLowerCase() === "form-data";
      continue;
    }
    const eq = seg.indexOf("=");
    if (eq < 0) {
      continue;
    }
    const k = trimWs(seg.slice(0, eq)).toLowerCase();
    const val = unquote(seg.slice(eq + 1));
    if (k === "name") {
      out.name = val;
    } else if (k === "filename") {
      out.filename = val;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Parser — boundary state machine over Uint8Array chunks
// ---------------------------------------------------------------------------

// States.
const MP_BOUNDARY = 0; // seeking the next "--boundary" line
const MP_AFTER = 1; // just consumed a delimiter: "--" ends, CRLF starts a part
const MP_HEADERS = 2; // accumulating the part header block (\r\n\r\n ends it)
const MP_CONTENT = 3; // emitting part bytes until "\r\n--boundary"
const MP_DONE = 4; // terminal boundary seen; rest is epilogue

// Error codes: 0 ok, 1 malformed (or truncated) body, 2 limit breached.
export const MP_ERR_MALFORMED = 1;
export const MP_ERR_LIMIT = 2;

// A part header block larger than this is treated as malformed rather than
// accumulated (all header bytes sit in _pend while the block is open).
const MP_MAX_HEADER = 16384;

export class MultipartParser {
  _delim: string; // "--" + boundary
  _cterm: string; // "\r\n--" + boundary
  _st: number;
  _pend: Uint8Array;
  _storage: MultipartStorage;
  _maxFileB: number;
  _maxFiles: number;
  _maxFieldB: number;
  // Current part.
  _skip: boolean;
  _isFile: boolean;
  _field: string;
  _filename: string;
  _mime: string;
  _sink: MultipartFileSink | null;
  _fbytes: Uint8Array[];
  _fsize: number;
  _nfiles: number;
  err: number;
  files: UploadedFile[];
  // Flat [name, value, ...] — same shape ReqView uses for params/query.
  fields: string[];

  constructor(
    boundary: string,
    storage: MultipartStorage,
    maxFileBytes: number,
    maxFiles: number,
    maxFieldBytes: number,
  ) {
    this._delim = "--" + String(boundary);
    this._cterm = "\r\n--" + String(boundary);
    this._st = MP_BOUNDARY;
    this._pend = EMPTY_U8;
    this._storage = storage;
    this._maxFileB = Number(maxFileBytes);
    this._maxFiles = Number(maxFiles);
    this._maxFieldB = Number(maxFieldBytes);
    this._skip = false;
    this._isFile = false;
    this._field = "";
    this._filename = "";
    this._mime = "";
    this._sink = null;
    this._fbytes = [];
    this._fsize = 0;
    this._nfiles = 0;
    this.err = 0;
    this.files = [];
    this.fields = [];
  }

  feed(chunk: Uint8Array): void {
    if (this.err !== 0) {
      return;
    }
    const buf = u8cat(this._pend, chunk);
    let pos = 0;
    for (;;) {
      if (this.err !== 0 || this._st === MP_DONE) {
        this._pend = EMPTY_U8;
        return;
      }
      if (this._st === MP_BOUNDARY) {
        const i = findSeq(buf, this._delim, pos);
        if (i < 0) {
          const keep = this._delim.length + 4;
          if (buf.length > keep) {
            this._pend = u8slice(buf, buf.length - keep, buf.length);
          } else {
            this._pend = u8slice(buf, 0, buf.length);
          }
          return;
        }
        pos = i + this._delim.length;
        this._st = MP_AFTER;
      } else if (this._st === MP_AFTER) {
        if (pos + 2 > buf.length) {
          this._pend = u8slice(buf, pos, buf.length);
          return;
        }
        const b0 = buf[pos];
        const b1 = buf[pos + 1];
        if (b0 === 45 && b1 === 45) {
          this._st = MP_DONE;
          pos = pos + 2;
        } else if (b0 === 13 && b1 === 10) {
          this._st = MP_HEADERS;
          pos = pos + 2;
        } else {
          // A delimiter followed by anything but CRLF or -- is not a
          // boundary — RFC 7578 requires it at a line start.
          this._malformed();
          return;
        }
      } else if (this._st === MP_HEADERS) {
        const i = findSeq(buf, "\r\n\r\n", pos);
        if (i < 0) {
          if (buf.length - pos > MP_MAX_HEADER) {
            this._malformed();
            return;
          }
          this._pend = u8slice(buf, pos, buf.length);
          return;
        }
        this._startPart(u8slice(buf, pos, i));
        if (this.err !== 0) {
          this._pend = EMPTY_U8;
          return;
        }
        pos = i + 4;
        this._st = MP_CONTENT;
      } else {
        const i = findSeq(buf, this._cterm, pos);
        if (i < 0) {
          // Emit everything except a carry large enough to hold a split
          // "\r\n--boundary" plus its two-byte suffix.
          const keep = this._cterm.length + 2;
          const safeEnd = buf.length - keep;
          if (safeEnd > pos) {
            this._emit(u8slice(buf, pos, safeEnd));
            this._pend = u8slice(buf, safeEnd, buf.length);
          } else {
            this._pend = u8slice(buf, pos, buf.length);
          }
          return;
        }
        this._emit(u8slice(buf, pos, i));
        if (this.err !== 0) {
          this._pend = EMPTY_U8;
          return;
        }
        this._endPart();
        pos = i + this._cterm.length;
        this._st = MP_AFTER;
      }
    }
  }

  // Called on request 'end'. Mid-part EOF is malformed; a clean DONE (or a
  // boundary-seek with no pending bytes — empty preamble tail) is fine.
  finish(): void {
    if (this.err !== 0) {
      return;
    }
    if (this._st === MP_DONE) {
      return;
    }
    this._malformed();
  }

  _malformed(): void {
    this.err = MP_ERR_MALFORMED;
    this._abortPart();
  }

  _limit(): void {
    this.err = MP_ERR_LIMIT;
    this._abortPart();
  }

  _abortPart(): void {
    const s = this._sink;
    if (s !== null) {
      s.abort();
      this._sink = null;
    }
  }

  _startPart(hdrBytes: Uint8Array): void {
    this._skip = false;
    this._isFile = false;
    this._field = "";
    this._filename = "";
    this._mime = "application/octet-stream";
    this._sink = null;
    this._fbytes = [];
    this._fsize = 0;
    const hdr = u8str(hdrBytes);
    const lines = hdr.split("\r\n");
    let cd = "";
    for (let i = 0; i < lines.length; i++) {
      const line = String(lines[i]);
      const colon = line.indexOf(":");
      if (colon < 0) {
        continue;
      }
      const k = trimWs(line.slice(0, colon)).toLowerCase();
      const v = trimWs(line.slice(colon + 1));
      if (k === "content-disposition") {
        cd = v;
      } else if (k === "content-type") {
        this._mime = v;
      }
    }
    if (cd === "") {
      this._skip = true;
      return;
    }
    const dp = parseDisposition(cd);
    if (!dp.formData || dp.name === null) {
      // Not a form-data part or no field name — consume and discard.
      this._skip = true;
      return;
    }
    this._field = dp.name;
    if (dp.filename === null) {
      // Plain field.
      return;
    }
    this._isFile = true;
    this._filename = basename(dp.filename);
    this._nfiles = this._nfiles + 1;
    if (this._maxFiles > 0 && this._nfiles > this._maxFiles) {
      this._limit();
      return;
    }
    this._sink = this._storage.begin(this._field, this._filename, this._mime);
  }

  _emit(b: Uint8Array): void {
    if (this._skip || b.length === 0) {
      return;
    }
    this._fsize = this._fsize + b.length;
    if (this._isFile) {
      if (this._maxFileB > 0 && this._fsize > this._maxFileB) {
        this._limit();
        return;
      }
      const s = this._sink;
      if (s !== null) {
        s.write(b);
      }
    } else {
      if (this._maxFieldB > 0 && this._fsize > this._maxFieldB) {
        this._limit();
        return;
      }
      this._fbytes.push(b);
    }
  }

  _endPart(): void {
    if (this._skip) {
      return;
    }
    if (this._isFile) {
      const s = this._sink;
      this._sink = null;
      if (s !== null) {
        s.end();
        const f = s.file();
        if (f !== null) {
          this.files.push(f);
        }
      }
    } else {
      this.fields.push(this._field);
      this.fields.push(u8str(u8catAll(this._fbytes)));
      this._fbytes = [];
    }
  }
}
