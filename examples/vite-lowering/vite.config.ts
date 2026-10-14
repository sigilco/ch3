import { defineConfig } from 'vite'
import { chttpPlugin } from '@chttp/unplugin'

export default defineConfig({
  plugins: [chttpPlugin.vite()],
  // SSR-style node build: the server is the build target, not the browser.
  build: {
    ssr: 'src/main.ts',
    outDir: 'dist',
    minify: false,
    rollupOptions: {
      output: { format: 'es' },
    },
  },
  // bundle chttp + the generated dispatch into dist/main.js so the
  // output is self-contained (only node:* stays external)
  ssr: { noExternal: true },
})
