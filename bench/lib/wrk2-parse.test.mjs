// node --test lib/wrk2-parse.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseWrk2 } from './wrk2-parse.mjs'

const SAMPLE = `
Running 10s test @ http://127.0.0.1:3000/json
  4 threads and 64 connections
  Thread Stats   Avg      Stdev     Max   +/- Stdev
    Latency     2.49ms    4.30ms  56.54ms   92.40%
    Req/Sec    25.12k     1.23k    30.10k    80.2%
  Latency Distribution (HdrHistogram - Recorded Latency)
 50.000%    1.30ms
 75.000%    2.18ms
 90.000%    5.51ms
 99.000%   17.25ms
 99.900%   50.65ms
 99.990%   54.30ms
 99.999%   55.68ms
100.000%   56.58ms
  Detailed Percentile spectrum:
       Value   Percentile   TotalCount 1/(1-Percentile)

       0.018     0.000000            2         1.00
       0.439     0.100000        17837         1.11
       1.018     0.500000        88958         2.00
       1.391     0.750000       133360         4.00
       1.799     0.900000       159927        10.00
       2.500     0.950000       170000        20.00
       4.527     0.990000       176000       100.00
      11.679     1.000000       178378   178378.00
  178378 requests in 3.00s, 29.25MB read
Requests/sec:  59428.83
Transfer/sec:      9.75MB
`

test('parses spectrum percentiles', () => {
  const r = parseWrk2(SAMPLE)
  assert.equal(r.rps, 59428.83)
  assert.equal(r.p50, 1.018)
  assert.equal(r.p95, 2.5)
  assert.equal(r.p99, 4.527)
  assert.equal(r.max, 11.679)
  assert.equal(r.mbps, 9.75)
  assert.equal(r.errors, 0)
  assert.equal(r.non2xx, 0)
})

test('parses socket errors and non-2xx', () => {
  const r = parseWrk2(SAMPLE + 'Socket errors: connect 3, read 1, write 2, timeout 7\nNon-2xx or 3xx responses: 4242\n')
  assert.equal(r.errors, 6)
  assert.equal(r.timeouts, 7)
  assert.equal(r.non2xx, 4242)
})

test('falls back to Latency Distribution when spectrum absent', () => {
  const noSpectrum = SAMPLE.replace(/  Detailed Percentile spectrum:[\s\S]*?requests in/, 'requests in')
  const r = parseWrk2(noSpectrum)
  assert.equal(r.p50, 1.30)
  assert.equal(r.p99, 17.25)
  assert.equal(r.max, 56.58)
  assert.equal(r.p95, null)
})

test('KB/GB transfer units', () => {
  const r = parseWrk2(SAMPLE.replace('9.75MB', '512KB').replace('59428.83', '100'))
  assert.equal(r.mbps, 0.5)
})
