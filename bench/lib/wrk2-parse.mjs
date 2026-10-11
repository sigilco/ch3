// Parse wrk2 stdout+stderr into { p50, p95, p99, max, rps, mbps, errors, timeouts, non2xx }.
// Latency comes from the "Detailed Percentile spectrum" table (-L): rows are
// `<value-ms> <fraction> <count> <1/(1-p)>` — first row at/above each target
// percentile wins (hdr buckets quantize); last row is the max.
export function parseWrk2(out) {
  const summaryPct = {}
  const units = { us: 1e-3, ms: 1, s: 1e3 }
  for (const m of out.matchAll(/^\s*(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)(us|ms|s)\b/gm)) {
    summaryPct[Number(m[1])] = Number(m[2]) * units[m[3]]
  }
  const spectrum = []
  let inSpectrum = false
  for (const line of out.split('\n')) {
    if (/Detailed Percentile spectrum/.test(line)) { inSpectrum = true; continue }
    if (inSpectrum) {
      const m = /^\s*([\d.]+)\s+(0\.\d+|1\.0+)\s+\d+\s+[\d.]+\s*$/.exec(line)
      if (m) { spectrum.push([Number(m[2]), Number(m[1])]); continue }
      if (spectrum.length && !/^\s*(#|Value|Percentile|$)/.test(line)) break
    }
  }
  spectrum.sort((a, b) => a[0] - b[0])
  const atPct = (f) => {
    const hit = spectrum.find(([p]) => p >= f - 1e-9)
    return hit ? hit[1] : (spectrum.length ? spectrum[spectrum.length - 1][1] : null)
  }
  const rps = /Requests\/sec:\s*([\d.]+)/.exec(out)
  const xfer = /Transfer\/sec:\s*([\d.]+)(KB|MB|GB)/.exec(out)
  const xferMult = { KB: 1 / 1024, MB: 1, GB: 1024 }
  const sockErr = /Socket errors: connect (\d+), read (\d+), write (\d+), timeout (\d+)/.exec(out)
  const non2xx = /Non-2xx or 3xx responses:\s*(\d+)/.exec(out)
  return {
    rps: rps ? Number(rps[1]) : null,
    p50: atPct(0.5) ?? summaryPct[50] ?? null,
    p95: atPct(0.95),
    p99: atPct(0.99) ?? summaryPct[99] ?? null,
    max: spectrum.length ? spectrum[spectrum.length - 1][1] : (summaryPct[100] ?? null),
    mbps: xfer ? Number(xfer[1]) * xferMult[xfer[2]] : null,
    errors: sockErr ? Number(sockErr[1]) + Number(sockErr[2]) + Number(sockErr[3]) : 0,
    timeouts: sockErr ? Number(sockErr[4]) : 0,
    non2xx: non2xx ? Number(non2xx[1]) : 0,
  }
}
