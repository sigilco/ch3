import { defineConfig } from 'vite'
import { ch3Plugin } from '@ch3/unplugin'

export default defineConfig({
  plugins: [ch3Plugin.vite()],
  // SSR-style node build: the server is the build target, not the browser.
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
