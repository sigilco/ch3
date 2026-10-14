// Node-side SSG sketch — subset-exempt. Proves prerender is a build-host
// concern, not an ELF concern: import the same html helper under node and
// write files. An unplugin pass would do this for static routes.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const htmlMod = await import(pathToFileURL(join(root, "lib/html.ts")).href);
const { html } = htmlMod;

const page = html`<!doctype html><html><body><h1>prerendered</h1></body></html>`;
const outDir = join(root, ".out/ssg");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "index.html"), page.s);
console.log("wrote " + join(outDir, "index.html") + " (" + page.s.length + " bytes)");
