import { defineConfig } from "vite";
import { chttpPlugin } from "@chttp/unplugin";

export default defineConfig({
  plugins: [
    chttpPlugin.vite({
      // routes reach the router through the local barrel (source paths —
      // see src/chttp.ts); tell the extractor it marks chttp modules and emit
      // the App type import through it as well
      imports: ["./chttp.ts"],
      importFrom: "../chttp.ts",
      // side-channel OpenAPI document (.chttp/routes.openapi.ts) beside the
      // gen dispatch; see PLUGIN.md
      openapi: true,
    }),
  ],
  build: {
    ssr: "src/main.ts",
    outDir: "dist",
    minify: false,
    rollupOptions: {
      output: { format: "es" },
    },
  },
  // bundle chttp + the generated dispatch into dist/main.js so the
  // output is self-contained (only node:* stays external)
  ssr: { noExternal: true },
});
