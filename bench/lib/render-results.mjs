// Aggregate results/*.jsonl + *.meta.jsonl -> RESULTS-baseline.md (stdout).
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'

const DIR = new URL('../results/', import.meta.url).pathname
const cells = {}
const meta = {}
for (const f of readdirSync(DIR)) {
  if (!f.endsWith('.jsonl')) continue
  for (const line of readFileSync(DIR + f, 'utf8').split('\n')) {
    if (!line.trim()) continue
    const r = JSON.parse(line)
    if (f.endsWith('.meta.jsonl')) {
      meta[r.subject] = { ...(meta[r.subject] || {}), ...r }
    } else {
      const k = r.subject + '|' + r.cell
      ;(cells[k] = cells[k] || { subject: r.subject, cell: r.cell, runs: [] }).runs.push(r)
    }
  }
}

const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }
const fmt = (n, d = 0) => n == null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d })

const subjects = {}
for (const k of Object.keys(cells)) {
  const e = cells[k]
  subjects[e.subject] = subjects[e.subject] || {}
  subjects[e.subject][e.cell] = {
    rps: med(e.runs.map((r) => r.rps)),
    p50: med(e.runs.map((r) => r.p50)),
    p99: med(e.runs.map((r) => r.p99)),
    mbps: med(e.runs.map((r) => r.mbps)),
    errors: e.runs.reduce((a, r) => a + (r.errors || 0) + (r.timeouts || 0), 0),
  }
}

const RATIO_BASE = 'raw-node'
const base = subjects[RATIO_BASE] || {}
const CELLS = ['json', 'user', 'echo64', 'echo1k', 'deep', 'files', 'missing', 'mixed']

let out = ''
out += `| subject | cell | rps | vs raw-node | p50 ms | p99 ms | MB/s | errs |\n`
out += `|---------|------|-----|-------------|--------|--------|------|------|\n`
for (const s of Object.keys(subjects)) {
  for (const c of CELLS) {
    const v = subjects[s][c]
    if (!v) continue
    const ratio = base[c] ? v.rps / base[c].rps : null
    out += `| ${s} | ${c} | ${fmt(v.rps)} | ${ratio == null ? '—' : fmt(ratio, 2) + '×'} | ${fmt(v.p50, 2)} | ${fmt(v.p99, 1)} | ${fmt(v.mbps, 1)} | ${v.errors} |\n`
  }
}
out += `\n| subject | cold start ms (median of 10) | RSS after 100k reqs | binary size |\n`
out += `|---------|------------------------------|---------------------|-------------|\n`
for (const s of Object.keys(subjects)) {
  const m = meta[s] || {}
  const rss = m.rss_kb_after_100k ? fmt(m.rss_kb_after_100k / 1024, 0) + ' MB' : '—'
  const bin = m.binary_bytes ? fmt(m.binary_bytes / 1048576, 1) + ' MB' : '—'
  out += `| ${s} | ${fmt(m.median_ms, 0)} | ${rss} | ${bin} |\n`
}
process.stdout.write(out)
writeFileSync(new URL('../results/aggregated.json', import.meta.url), JSON.stringify({ subjects, meta }, null, 2))
