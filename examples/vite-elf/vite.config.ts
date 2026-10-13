import { defineConfig } from "vite";
import { scriptcPlugin } from "@sigilco/unplugin-scriptc";

export default defineConfig({
  plugins: [
    scriptcPlugin.vite({
      entry: "src/main.ts",
      out: "dist/app",
      optimization: "speed",
    }),
  ],
  build: {
    ssr: "src/main.ts",
    outDir: "dist",
    rollupOptions: { output: { format: "es" } },
  },
  ssr: { noExternal: true },
});
