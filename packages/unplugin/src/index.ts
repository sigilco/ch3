// unplugin-chttp — build-time route lowering for chttp.
//
// A routes module (default: any file matching `**\/*.chttp.{ts,js}`) is
// analyzed at build start; the plugin writes
// `<dir>/.chttp/<name>.gen.ts` satisfying docs/route-contract.md:
//   - `export class CompiledRoutes extends GenDispatch` — registered
//     once via `app.withDispatch(new CompiledRoutes(app))` in the
//     app-owning entry, tried first on every request,
//   - `routeTable` — the literal route table.
// The app reaches the class through its constructor: a dependency
// module cannot import an app binding rooted at a package
// instantiation under `scriptc build` (SC1090).
//
// The generated module reaches handlers through the App._chains index
// array — the same table the internal dispatch calls — so it stays
// scriptc-subset-clean and never copies handler source.

import * as fs from "node:fs";
import * as path from "node:path";
import picomatch from "picomatch";
import { createUnplugin } from "unplugin";
import { emitGenModule, genFileName } from "./emit.ts";
import { extractModule } from "./extract.ts";
import { tsgoAvailable } from "./parse/index.ts";

export interface ChttpPluginOptions {
  // Globs (relative to root) marking route-registration modules.
  // Default: ['**\/*.chttp.ts', '**\/*.chttp.js']
  include?: string[];
  // Project root to scan. Default: vite config.root, else process.cwd().
  root?: string;
  // Import specifier emitted in the gen file for `import type { App }`.
  // Default: 'chttp'
  importFrom?: string;
  // Exported binding carrying the router instance: a name, or 'default'.
  // Default: auto-detect.
  appExport?: string;
  // Extra module specifiers treated as chttp imports (in addition to
  // 'chttp').
  imports?: string[];
  // Parser backend: 'classic' (default, the tsc 5.x/6.x API) or 'tsgo'
  // (experimental; requires a typescript 7.x nightly providing the
  // 'typescript/sync' subpath). Selecting 'tsgo' without the nightly
  // installed warns and falls back to classic.
  parser?: "classic" | "tsgo";
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".chttp", ".vite"]);

function walk(dir: string, out: string[]): void {
  let ents: fs.Dirent[];
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) {
        walk(p, out);
      }
    } else if (e.isFile()) {
      out.push(p);
    }
  }
}

export const chttpPlugin = createUnplugin((options?: ChttpPluginOptions) => {
  const include = options?.include ?? ["**/*.chttp.ts", "**/*.chttp.js"];
  const importFrom = options?.importFrom ?? "chttp";
  let root = options?.root ?? process.cwd();

  let parserName = options?.parser ?? "classic";
  if (parserName === "tsgo") {
    console.warn(
      "[unplugin-chttp] parser 'tsgo' is experimental: it requires a typescript 7.x nightly " +
        "(typescript@next) whose sync API breaks between nightlies, so pin the exact version " +
        "you tested. " +
        (tsgoAvailable()
          ? "Nightly detected."
          : "No 'typescript/sync' resolvable here: falling back to classic."),
    );
    if (!tsgoAvailable()) {
      parserName = "classic";
    }
  }

  const matches = (id: string): boolean => {
    const rel = path.isAbsolute(id) ? path.relative(root, id) : id;
    return picomatch.isMatch(rel, include, { dot: true });
  };

  const generate = (id: string, warn: (m: string) => void): void => {
    const code = fs.readFileSync(id, "utf8");
    const model = extractModule(id, code, {
      appExport: options?.appExport,
      imports: options?.imports,
      parser: parserName,
    });
    const gen = emitGenModule(model, { importFrom: importFrom, modulePath: id });
    const out = path.join(path.dirname(id), ".chttp", genFileName(id));
    let prev = "";
    try {
      prev = fs.readFileSync(out, "utf8");
    } catch {
      prev = "";
    }
    if (prev !== gen) {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, gen);
    }
    for (const w of model.warnings) {
      warn(w);
    }
  };

  return {
    name: "unplugin-chttp",
    enforce: "pre",
    vite: {
      configResolved(config: { root: string }): void {
        root = options?.root ?? config.root;
      },
    },
    buildStart(): void {
      // UnpluginContext.warn only exists on transform/load — outside those
      // hooks, console.warn is the honest channel.
      const files: string[] = [];
      walk(root, files);
      for (const f of files) {
        if (matches(f)) {
          generate(f, (m) => console.warn("[unplugin-chttp] " + m));
        }
      }
    },
    transform(code: string, id: string): null {
      // Regenerate from the freshest source whenever the bundler touches a
      // routes module — covers watch mode on bundlers without watchChange.
      if (matches(id)) {
        try {
          generate(id, (m) => this.warn(m));
        } catch (e) {
          this.warn("unplugin-chttp: failed to generate for " + id + ": " + String(e));
        }
      }
      return null;
    },
    watchChange(id: string): void {
      if (matches(id)) {
        try {
          generate(id, (m) => console.warn("[unplugin-chttp] " + m));
        } catch {
          // leave the previous gen file in place
        }
      }
    },
  };
});

export default chttpPlugin;
