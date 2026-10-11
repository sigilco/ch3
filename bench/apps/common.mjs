// Shared canonical route table for the ch3 bench suite (DESIGN.md §5).
// Every framework app consumes these so the tables are identical.

export const JSON_BODY = '{"hello":"world"}'
export const OK_BODY = '{"ok":true}'

// 100-route mixed table: 60 static / 30 param / 10 wildcard.
export const MIXED_STATIC = []   // ['/m/s0/detail', ...]        (60)
export const MIXED_PARAM = []    // ['/m/p0/:id', ...]           (30 patterns)
export const MIXED_WILD = []     // ['/m/w0/*', ...]             (10 patterns)
for (let i = 0; i < 60; i++) MIXED_STATIC.push(`/m/s${i}/detail`)
for (let i = 0; i < 30; i++) MIXED_PARAM.push(`/m/p${i}/:id`)
for (let i = 0; i < 10; i++) MIXED_WILD.push(`/m/w${i}/*`)

// Hit paths for the mixed table (concrete URLs, one per route).
export const MIXED_HITS = []
for (let i = 0; i < 60; i++) MIXED_HITS.push(`/m/s${i}/detail`)
for (let i = 0; i < 30; i++) MIXED_HITS.push(`/m/p${i}/v${i}`)
for (let i = 0; i < 10; i++) MIXED_HITS.push(`/m/w${i}/a/b/tail-${i}.txt`)

// Deterministic shuffle (mulberry32) -> uniform-random request order,
// identical for every subject. 4 hits per route = 400 requests.
export function mixedWorkload() {
  const reqs = []
  for (let rep = 0; rep < 4; rep++) {
    for (const path of MIXED_HITS) reqs.push({ method: 'GET', path })
  }
  let seed = 0x9e3779b9
  const rand = () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  for (let i = reqs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = reqs[i]; reqs[i] = reqs[j]; reqs[j] = tmp
  }
  return reqs
}

export const PORT = 3000
