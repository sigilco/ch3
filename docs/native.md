# Native FFI

How a compiled chttp app calls C code, and why this lives in docs instead of a package.

## Why docs, not a package

Outbound FFI in scriptc is build-time plumbing, not a runtime API: a `declare function` in your source plus a JSON manifest passed to `scriptc build`. There is nothing a `@chttp/*` package could wrap that the toolchain does not already do, so chttp documents the pattern and ships a worked example (`examples/ws-echo`) rather than an abstraction.

## N-API is unavailable in ELFs

Under Node, native code usually arrives as a Node-API addon. That path is closed in a compiled binary — the scriptc docs put it plainly: "Compiled programs can't load Node-API (`.node`) addons, because those depend on Node.js itself." Renaming a `.node` file or linking an archive that still calls `napi_*` does not remove the dependency; move the operation into a plain C function and call it through FFI.

## Two runtimes, two FFI styles

| | Node.js | Native ELF (`scriptc build`) |
| --- | --- | --- |
| Mechanism | `koffi`, `node:ffi` (Node 22+), napi-rs addons | `scriptc build --ffi <manifest>` |
| Declaration | Runtime FFI object | `declare function` at module scope |
| Linking | Shared library loaded at runtime | Object/archive linked into the binary |

Same C function, different plumbing. A project targeting both keeps the C code shared and swaps the binding layer.

## Manifest and declaration

The manifest describes the C signature; the declaration gives TypeScript its types. TypeScript only has `number`, so the manifest decides the actual C width:

```ts
declare function nativeScale(value: number, factor: number): number;
```

```json
{
  "ffi_format": 1,
  "functions": [
    {
      "name": "nativeScale",
      "symbol": "native_scale",
      "params": ["f64", "f64"],
      "returns": "f64"
    }
  ],
  "libraries": ["./libnative.a"]
}
```

```sh
scriptc build main.ts --ffi ffi.json -o app
```

Pass the same manifest to `scriptc coverage` so the native calls count as compiled.

## ABI classes

`ffi_format` selects the available classes:

- Formats 1–5: `f64`, `bool`, `u8`, `u32`, `i32` (all `number`), `cstring`/`string`/`bytes` (callback input only), `void`.
- Format 6 adds `f32`, `i8`/`u16`/`i16`, and `mutable-bytes` — a writable borrow of a `Uint8Array`/`Buffer` view; in-place writes are visible through the original array.
- Format 7 adds `i64`, `u64`, `pointer` (`bigint` in TypeScript).

`string`/`bytes` pointers are borrowed for the call duration; native code must not mutate, free, or retain them. String and byte returns are unsupported — they need an ownership contract. Format 7 can return an opaque pointer as a `bigint`; scriptc does not infer its lifetime.

## Callbacks and threads

C APIs that take a function pointer map to a callback descriptor (`"callback"`) in the manifest, with an optional `void *` context entry the compiler supplies:

- `lifetime: "call"` (format 2) — call-scoped; valid only for the duration of the FFI call. No userdata parameter is needed for plain callbacks — scriptc installs the closure in a binding-specific thread-local slot.
- `lifetime: "retained"` (format 4) — same-thread native APIs that store the callback and invoke it later; pair registration with a release binding.
- `invoke: "foreign"` (format 5) — a native thread invokes the closure; delivery is queued onto the JavaScript event loop, so the closure always runs on the main thread.

Foreign-thread delivery is the same trick the router uses internally: `settleChain` in `packages/router/src/index.ts` settles a chain result by `await`ing it inside a scheduled task rather than on the caller's stack. FFI format 5 gives you the same guarantee for C-side threads — the callback fires on the event loop, never re-entrantly inside native code.

## Bridging Node and ELF

Format 7 emits `node:ffi` static bindings: the same manifest and `declare function` shape runs against Node's built-in FFI, so one C library can serve both the Node entrypoint and the compiled ELF without a second binding layer.

## Constraints

- Outbound FFI is an executable feature. Quoting the scriptc docs: "Outbound FFI is currently available for executable builds, not `scriptc build --lib`."
- Build the object/archive for the same target as the scriptc binary. `cc -c` is the portable baseline (`ar rcs` for an archive); `zig cc` works when you need cross-compilation, but adds a toolchain dependency.
- Compiled ELFs can still reach system libraries via `system_libraries` in the manifest.

## Common Node native modules

The question behind most FFI work: "can my compiled app use what npm packages use?" Sort the ecosystem by where the native code lives:

| Module style | Examples | Compiled ELF? |
| --- | --- | --- |
| N-API `.node` addon | `sqlite3`, `better-sqlite3`, `bcrypt`, `sharp`, `argon2` | No — addons depend on Node.js itself. But their C/C++ cores usually can be rebound via `--ffi` with a thin shim. |
| Node builtin | `node:sqlite`, `node:crypto` | Refused by the compiler unless scriptc ships its own lowering (`node:sqlite` is refused; crypto/fs/http are already lowered). |
| Pure-JS package | most of npm | Compiles only if the source stays inside the scriptc subset — real packages rarely do. |
| System C library | `libsqlite3`, `libz`, `libcurl`, OpenSSL | Yes — `libraries`/`system_libraries` link it directly. |

The pattern that works is the one the docs describe for replacing a Node-API addon: keep using the addon's underlying C library, but call it through a fixed-signature shim. Verified with libsqlite3: a 30-line shim (`shim_open`/`shim_exec`/`shim_count`) compiled with `cc -c`, linked via `"libraries": ["./shim.o", "/usr/lib/x86_64-linux-gnu/libsqlite3.a"]` and `"system_libraries": ["pthread", "dl", "m"]`, runs `CREATE TABLE`/`INSERT`/`SELECT count(*)` from a compiled ELF — `i64` results arrive as `bigint` (format 7).

What this means per package:

- **sqlite3 / better-sqlite3** — drop the addon, bind `libsqlite3` through a shim exposing the few calls you need (open/exec/prepare/step). The async and prepared-statement ergonomics live in the shim, not in scriptc.
- **bcrypt / argon2** — same shape: the C core (`crypt_blowfish`, libargon2) links fine; write `hash(password, salt)` / `verify` entry points in the shim.
- **sharp / canvas** — libvips/cairo are linkable C libraries, but expect a real port: these APIs are wide, and the shim becomes a project of its own.
- **Anything pure-JS with native fallback** — try the JS path first; fall back to `--ffi` only where the subset refuses.

Keep the shim minimal and stateless where you can: every fixed signature you add is one manifest entry and one `declare function`.

## Example

`examples/ws-echo` computes FNV-1a in C: `GET /ffi/{text}` passes each byte to native code through a call-scoped `next()` callback (`ffi.json`, `ffi_native.c`), and the build compiles the object before `scriptc build --ffi`. `tests/ws-echo-ffi-smoke/run.sh` builds the ELF and asserts the route end to end.
