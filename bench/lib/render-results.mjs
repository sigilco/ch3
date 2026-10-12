// Aggregate results/*.jsonl + results-wrk2/*.jsonl + *.meta.jsonl -> markdown (stdout).
// Also writes results/aggregated.json for downstream tooling.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'

const DIR = new URL('../results/', import.meta.url).pathname
const WDIR = new URL('../results-wrk2/', import.meta.url).pathname
const cells = {}
const meta = {}
const wrkCells = {}

const collect = (dir, into) => {
  if (!existsSync(dir)) return
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.jsonl')) continue
    for (const line of readFileSync(dir + f, 'utf8').split('\n')) {
      if (!line.trim()) continue
      const r = JSON.parse(line)
      if (f.endsWith('.meta.jsonl')) { meta[r.subject] = { ...(meta[r.subject] || {}), ...r }; continue }
      const k = r.subject + '|' + r.cell
      ;(into[k] = into[k] || { subject: r.subject, cell: r.cell, runs: [] }).runs.push(r)
    }
  }
}
collect(DIR, cells)
collect(WDIR, wrkCells)

const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }
const fmt = (n, d = 0) => n == null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d })

const subjects = {}
for (const k of Object.keys(cells)) {
  const e = cells[k]
  subjects[e.subject] = subjects[e.subject] || {}
  subjects[e.subject][e.cell] = {
    rps: med(e.runs.map((r) => r.rps)),
    p50: med(e.runs.map((r) => r.p50)),
    p90: med(e.runs.map((r) => r.p90)),
    p97_5: med(e.runs.map((r) => r.p97_5)),
    p99: med(e.runs.map((r) => r.p99)),
    max: Math.max(...e.runs.map((r) => r.max || 0)),
    mbps: med(e.runs.map((r) => r.mbps)),
    errors: e.runs.reduce((a, r) => a + (r.errors || 0), 0),
    timeouts: e.runs.reduce((a, r) => a + (r.timeouts || 0), 0),
    non2xx: e.runs.reduce((a, r) => a + (r.non2xx || 0), 0),
  }
}
const wrkSubjects = {}
for (const k of Object.keys(wrkCells)) {
  const e = wrkCells[k]
  wrkSubjects[e.subject] = wrkSubjects[e.subject] || {}
  const run = e.runs[0] // one pass per cell by design
  wrkSubjects[e.subject][e.cell] = {
    target: run.target, achieved: run.rps, acRps: run.ac_rps,
    p50: run.p50, p95: run.p95, p99: run.p99, max: run.max, mbps: run.mbps,
    errors: run.errors, timeouts: run.timeouts, non2xx: run.non2xx,
  }
}

const RATIO_BASE = 'raw-node'
const base = subjects[RATIO_BASE] || {}
const CELLS = ['json', 'user', 'echo64', 'echo1k', 'deep', 'files', 'missing', 'mixed', 'root', 'hello', 'postuser', 'json-p10']

let out = ''
out += `## autocannon matrix (-c64 -d6, median; json x5, others x3; json-p10 = fastify-parity -c100 -p10 -d10 x3)\n\n`
out += `| subject | cell | rps | vs raw-node | p50 | p97.5 | p99 | max | MB/s | err/t/o | non2xx |\n`
out += `|---------|------|-----|-------------|-----|-------|-----|-----|------|---------|--------|\n`
for (const s of Object.keys(subjects)) {
  for (const c of CELLS) {
    const v = subjects[s][c]
    if (!v) continue
    const ratio = base[c] ? v.rps / base[c].rps : null
    out += `| ${s} | ${c} | ${fmt(v.rps)} | ${ratio == null ? '—' : fmt(ratio, 2) + 'x'} | ${fmt(v.p50, 2)} | ${fmt(v.p97_5, 1)} | ${fmt(v.p99, 1)} | ${fmt(v.max, 0)} | ${fmt(v.mbps, 1)} | ${v.errors}/${v.timeouts} | ${v.non2xx} |\n`
  }
}
out += `\n## wrk2 cross-validation (-t4 -c64 -d10 -R 80% of autocannon median, -L spectrum; latency in ms)\n\n`
out += `| subject | cell | target rps | achieved | ac rps | p50 | p95 | p99 | max | non2xx |\n`
out += `|---------|------|-----------|----------|--------|-----|-----|-----|-----|--------|\n`
for (const s of Object.keys(wrkSubjects)) {
  for (const c of ['json', 'user', 'root', 'postuser']) {
    const v = wrkSubjects[s][c]
    if (!v) continue
    out += `| ${s} | ${c} | ${fmt(v.target)} | ${fmt(v.achieved)} | ${fmt(v.acRps)} | ${fmt(v.p50, 2)} | ${fmt(v.p95, 2)} | ${fmt(v.p99, 1)} | ${fmt(v.max, 0)} | ${v.non2xx} |\n`
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
writeFileSync(new URL('../results/aggregated.json', import.meta.url), JSON.stringify({ subjects, wrkSubjects, meta }, null, 2))
