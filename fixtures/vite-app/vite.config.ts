import { defineConfig } from 'vite'
import { ch3Plugin } from 'unplugin-ch3'

export default defineConfig({
  plugins: [
    ch3Plugin.vite({
      // routes reach the router through the local barrel (source paths —
      // see src/ch3.ts); tell the extractor it marks ch3 modules and emit
      // the App type import through it as well
      imports: ['./ch3.ts'],
      importFrom: '../ch3.ts',
    }),
  ],
  build: {
    ssr: 'src/main.ts',
    outDir: 'dist',
    minify: false,
    rollupOptions: {
      output: { format: 'es' },
    },
  },
  // bundle ch3 + the generated dispatch into dist/main.js so the
  // output is self-contained (only node:* stays external)
  ssr: { noExternal: true },
})
