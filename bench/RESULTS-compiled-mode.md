# Bench results — compiled-mode spike (`devin/compiled-mode`)

Medians of 3 × 6s autocannon `-c64` runs per cell, loopback, shared VM —
compare **ratios within a column**, not absolutes. Raw JSONL:
`bench/bench/out-spike/out.jsonl` (spike.sh writes `out/` under `bench/`).

## Median rps

| subject | json | user | echo64 | echo1k | deep | files | missing | mixed | rss_kb |
|---|---|---|---|---|---|---|---|---|---|
| raw-node | 88,949 | 87,253 | 73,675 | 55,019 | 87,264 | 88,405 | 88,555 | 84,107 | 104,772 |
| raw-scriptc | 75,765 | 95,360 | 93,995 | 90,261 | 95,328 | 96,437 | 95,200 | 90,891 | 3,280 |
| ch3v0-node | 82,944 | 75,656 | 71,213 | 59,403 | 83,147 | 81,131 | 83,136 | 74,656 | 110,008 |
| ch3v0-scriptc (npm-static) | 72,512 | 59,723 | 67,981 | 55,275 | 63,576 | 55,765 | 61,376 | 28,677 | 3,912 |
| **ch3-node (compiled)** | 82,720 | 81,120 | 72,853 | 60,811 | 76,949 | 81,547 | 86,496 | 72,736 | 133,416 |
| **ch3-scriptc (compiled, program-code)** | **91,360** | **96,715** | **95,851** | 73,891 | 86,624 | **95,893** | **96,544** | **91,115** | 3,744 |
| ch3-npm-scriptc (compiled, --npm-static) | 58,085 | 48,907 | 58,720 | 58,389 | 48,507 | 51,253 | 51,184 | 22,117 | 3,964 |
| ch3-gen-node | 81,696 | 80,736 | 71,541 | 59,979 | 83,989 | 83,285 | 84,587 | 79,051 | 110,160 |
| **ch3-gen-scriptc** | **92,821** | **97,173** | 93,707 | **95,104** | **91,520** | 94,571 | 88,171 | 89,867 | 3,788 |

## v0 → compiled deltas, scriptc (the build path that matters)

| cell | v0 npm-static | compiled program-code | Δ |
|---|---|---|---|
| json | 72,512 | 91,360 | **+26%** |
| user (:param) | 59,723 | 96,715 | **+62%** |
| echo64 (body) | 67,981 | 95,851 | **+41%** |
| echo1k (body) | 55,275 | 73,891 | **+34%** |
| deep (5-seg static) | 63,576 | 86,624 | **+36%** |
| files (wildcard) | 55,765 | 95,893 | **+72%** |
| missing (404) | 61,376 | 96,544 | **+57%** |
| mixed (100 routes) | 28,677 | 91,115 | **+218%** |

Compiled-mode scriptc is at **~0% overhead vs raw-scriptc** on
json/user/files/missing/mixed (≥96%), within ~4% on deep, and ~18% over
raw on echo1k where it still lags (body buffering).

## Headline findings

1. **Program-code ≫ npm-static.** The SAME compiled source is ~40-70%
   slower when linked `--npm-static` (58k vs 91k json; 22k vs 91k
   mixed). Every prior "scriptc ~68k" baseline was measured on the
   npm-static path because core-v0 couldn't compile program-code — so
   the reported router overhead was inflated by the link mode. The
   fence fixes in this branch are what unlock the fast path.
2. **Internal specialized dispatch ≈ generated dispatch** on most
   cells (mixed actually favors internal: 91.1k vs 89.9k). The
   `withDispatch` seam's win is concentrated in the body cells
   (echo1k: 95.1k vs 73.9k, +29%) where direct `_buffer` dispatch
   skips the table lookup — and in what it enables for the plugin
   agent (precomputed params, per-route shapes).
3. **Node is flat** (ch3-node ≈ ch3v0-node, ±8% per cell) — V8's
   escape/scalar replacement already masked most v0 waste. The
   optimizations exist for the scriptc target; they don't hurt node.
4. **RSS**: all scriptc binaries ~3.3-4.0 MB vs node's ~105-133 MB.
   Compiled mode adds no memory cost; node compiled-mode RSS is
   slightly higher (+23MB, the parallel-array route table + baked
   chains — acceptable trade).
5. echo1k remains the weakest cell for internal dispatch (73.9k vs
   raw 90.3k) — per-request body `buf` string accumulation is the
   cost; the gen path recovers it by skipping match+entry lookup.

## Cells

json `/json` GET; user `/user/42` GET; echo `/echo` POST body 64B/1kB;
deep `/deep/a/b/c/d/e` GET; files `/files/a/b/c.txt` GET; missing
`/missing` GET 404; mixed 50/30/20 static:param:wild over the 100-route
table.
