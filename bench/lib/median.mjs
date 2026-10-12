// Read results/<subject>.jsonl, print {"<cell>": medianRps, ...} as JSON.
// Usage: node lib/median.mjs <subject>
import { readFileSync, existsSync } from 'node:fs'

const subject = process.argv[2]
const file = new URL(`../results/${subject}.jsonl`, import.meta.url).pathname
const cells = {}
if (existsSync(file)) {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    const r = JSON.parse(line)
    ;(cells[r.cell] = cells[r.cell] || []).push(r.rps)
  }
}
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }
const out = {}
for (const c of Object.keys(cells)) out[c] = med(cells[c])
console.log(JSON.stringify(out))
