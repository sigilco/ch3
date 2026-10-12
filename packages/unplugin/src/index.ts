// unplugin-ch3 — build-time route lowering for ch3.
//
// A routes module (default: any file matching `**\/*.ch3.{ts,js}`) is
// analyzed at build start; the plugin writes
// `<dir>/.ch3/<name>.gen.ts` satisfying docs/route-contract.md:
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

import * as fs from 'node:fs'
import * as path from 'node:path'
import picomatch from 'picomatch'
import { createUnplugin } from 'unplugin'
import { emitGenModule, genFileName } from './emit.ts'
import { extractModule } from './extract.ts'

export interface Ch3PluginOptions {
  // Globs (relative to root) marking route-registration modules.
  // Default: ['**\/*.ch3.ts', '**\/*.ch3.js']
  include?: string[]
  // Project root to scan. Default: vite config.root, else process.cwd().
  root?: string
  // Import specifier emitted in the gen file for `import type { App }`.
  // Default: 'ch3'
  importFrom?: string
  // Exported binding carrying the router instance: a name, or 'default'.
  // Default: auto-detect.
  appExport?: string
  // Extra module specifiers treated as ch3 imports (in addition to
  // 'ch3' and 'ch3').
  imports?: string[]
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.ch3', '.vite'])

function walk(dir: string, out: string[]): void {
  let ents: fs.Dirent[]
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true })
  } catch (e) {
    return
  }
  for (const e of ents) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) {
        walk(p, out)
      }
    } else if (e.isFile()) {
      out.push(p)
    }
  }
}

export const ch3Plugin = createUnplugin((options?: Ch3PluginOptions) => {
  const include = options?.include ?? ['**/*.ch3.ts', '**/*.ch3.js']
  const importFrom = options?.importFrom ?? 'ch3'
  let root = options?.root ?? process.cwd()

  const matches = (id: string): boolean => {
    const rel = path.isAbsolute(id) ? path.relative(root, id) : id
    return picomatch.isMatch(rel, include, { dot: true })
  }

  const generate = (id: string, warn: (m: string) => void): void => {
    const code = fs.readFileSync(id, 'utf8')
    const model = extractModule(id, code, {
      appExport: options?.appExport,
      imports: options?.imports,
    })
    const gen = emitGenModule(model, { importFrom: importFrom, modulePath: id })
    const out = path.join(path.dirname(id), '.ch3', genFileName(id))
    let prev = ''
    try {
      prev = fs.readFileSync(out, 'utf8')
    } catch (e) {
      prev = ''
    }
    if (prev !== gen) {
      fs.mkdirSync(path.dirname(out), { recursive: true })
      fs.writeFileSync(out, gen)
    }
    for (const w of model.warnings) {
      warn(w)
    }
  }

  return {
    name: 'unplugin-ch3',
    enforce: 'pre',
    vite: {
      configResolved(config: { root: string }): void {
        root = options?.root ?? config.root
      },
    },
    buildStart(): void {
      // UnpluginContext.warn only exists on transform/load — outside those
      // hooks, console.warn is the honest channel.
      const files: string[] = []
      walk(root, files)
      for (const f of files) {
        if (matches(f)) {
          generate(f, (m) => console.warn('[unplugin-ch3] ' + m))
        }
      }
    },
    transform(code: string, id: string): null {
      // Regenerate from the freshest source whenever the bundler touches a
      // routes module — covers watch mode on bundlers without watchChange.
      if (matches(id)) {
        try {
          generate(id, (m) => this.warn(m))
        } catch (e) {
          this.warn('unplugin-ch3: failed to generate for ' + id + ': ' + String(e))
        }
      }
      return null
    },
    watchChange(id: string): void {
      if (matches(id)) {
        try {
          generate(id, (m) => console.warn('[unplugin-ch3] ' + m))
        } catch (e) {
          // leave the previous gen file in place
        }
      }
    },
  }
})

export default ch3Plugin
