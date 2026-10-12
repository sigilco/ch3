---
type: concept
title: Benchmarks
source: "https://ch3js.pages.dev/benchmarks/"
path: /benchmarks/
updated: 2026-10-12
okf:
  generated_by: "@docmd/plugin-okf"
  generated_at: "2026-10-12T23:17:15.223Z"
---
# Benchmarks

Shared VM, compare ratios not absolutes. Full matrix, methodology, ceilings (go-chi / axum / mongoose), and a one-command Docker repro: [bench/RESULTS-v2.md](https://github.com/sigilco/ch3/blob/main/bench/RESULTS-v2.md).

| subject | json | pipelined (-c100 -p10) | cold start | RSS after 100k req |
|---|---|---|---|---|
| ch3 on node | 0.87× raw-node | 0.95× | 83 ms | 116 MB |
| ch3 compiled (ELF) | 1.15× raw-node | 1.76× (204k rps) | 3 ms | 4 MB |
| fastify on node | 0.69× | 0.65× | 111 ms | 108 MB |

The compiled build sits at ≥96% of a bare compiled `node:http` server on every cell: the router costs ~0.1-0.3 MB of binary and ~1 MB RSS.
