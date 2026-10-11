import { mkdirSync, writeFileSync } from 'node:fs'

// Mark the CJS output tree as CommonJS so dist/cjs/*.js files load under
// `require()` even though the package root declares "type": "module".
mkdirSync('dist/cjs', { recursive: true })
writeFileSync('dist/cjs/package.json', JSON.stringify({ type: 'commonjs' }) + '\n')
