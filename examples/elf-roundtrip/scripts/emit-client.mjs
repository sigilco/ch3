// Build helper: invokes @chttp/unplugin to emit the typed client.
//
// The unplugin's createUnplugin() returns a factory that produces
// rollup/vite/webpack/esbuild shapes. We use the rollup shape and
// call buildStart on a stub context so the plugin walks the include
// globs and writes src/.chttp/routes.openapi.ts +
// src/.chttp/routes.client.ts. No bundler is involved.
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const exampleRoot = dirname(here);
const srcDir = join(exampleRoot, "src");
const outDir = join(srcDir, ".chttp");

mkdirSync(outDir, { recursive: true });

// Resolve the installed unplugin. The pnpm-workspace.yaml at the
// example root links @chttp/unplugin to ../../packages/unplugin,
// so node_modules/@chttp/unplugin is a symlink to the workspace
// source. We use the resolved realpath to find the actual src.
const symlinkPath = join(exampleRoot, "node_modules", "@chttp", "unplugin");
const realPath = realpathSync(symlinkPath);
const distUrl = pathToFileURL(join(realPath, "src", "index.ts")).href;
const { chttpPlugin } = await import(distUrl);

// `chttpPlugin.rollup(opts)` returns a rollup-shaped plugin; calling
// buildStart on a stub plugin context triggers the unplugin to walk
// the include globs and emit .chttp/* next to every matching module.
const plugin = chttpPlugin.rollup({
  root: exampleRoot,
  openapi: true,
  client: true,
});

// buildStart is async; unplugin returns a Promise we must await.
const ctx = {
  warn: (m) => console.warn("[unplugin]", m),
};
const start = plugin.buildStart.call(ctx, async () => {});
if (start && typeof start.then === "function") {
  await start;
}

const openapiPath = join(outDir, "routes.openapi.ts");
const clientPath = join(outDir, "routes.client.ts");

if (!existsSync(openapiPath)) {
  throw new Error("unplugin did not emit " + openapiPath);
}
if (!existsSync(clientPath)) {
  throw new Error("unplugin did not emit " + clientPath);
}
console.log("emitted", openapiPath);
console.log("emitted", clientPath);
