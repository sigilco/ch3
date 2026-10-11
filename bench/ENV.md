# Bench environment

Captured on the VM that produced `RESULTS-baseline.md` (2026-10-11). Absolute numbers carry shared-VM noise — **compare ratios against the `raw-node` cell**, not absolutes (REPORT.md caveat: ±50% across VMs).

## Hardware / OS

| key | value |
|-----|-------|
| nproc | 8 |
| CPU model | INTEL(R) XEON(R) PLATINUM 8559C |
| scaling_governor | n/a (no cpufreq sysfs — AWS guest) |
| kernel | 6.8.0-1061-aws |
| RAM | 31 GiB |
| platform | Ubuntu (Linux x86-64, aws) |

## Toolchain versions

| tool | version |
|------|---------|
| node | v24.19.0 |
| bun | 1.4.3 |
| scriptc | 0.2.8 |
| autocannon | v8.0.0 (requests.average / latency p50,p99 / throughput) |
| hyperfine | 1.12.0 (installed; cold-start measured via spawn→first-200 instead — see run.sh) |
| clang | Ubuntu clang 14.0.0 |
| gcc | 11.4.0 |
| go | go1.18.1 linux/amd64 |
| rustc/cargo | 1.97.1 |

## Package versions

h3 2.0.2 · hono 4.13.13 · @hono/node-server 2.1.4 · find-my-way 9.10.0 · express 5.3.0 · chi v5.0.12 (pinned for go1.18) · axum 0.8.9 · mongoose 7.19 (vendored single-file)

## Notes

- All subjects listen on `127.0.0.1:3000`, one at a time; autocannon runs on the same box (loopback).
- Cold start = spawn → first HTTP 200 on `/json`, median of 10 (`lib/coldstart.mjs`). Uniform across runtimes and ELFs — more honest than `--version` since several subjects are interpreted.
- RSS = `ps -o rss` on the server PID immediately after a 100k-request `/json` run (`-c64 --amount 100000`).
