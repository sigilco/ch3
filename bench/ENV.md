# Bench environment

Captured on the VM that produced `RESULTS-v2.md` (2026-10-11). Absolute numbers carry shared-VM noise — **compare ratios against the `raw-node` cell**, not absolutes.

## Hardware / OS (full disclosure)

| key | value |
|-----|-------|
| virtualization | `systemd-detect-virt` = `kvm` — **shared cloud VM, NOT bare metal** |
| vCPUs | 8 (`nproc`=8, `/proc/cpuinfo` = 8), model `INTEL(R) XEON(R) PLATINUM 8559C` |
| hyperthreading | unknown/single-threaded vCPUs exposed |
| CPU flags | avx512_vnni, tsc_known_freq, constant_tsc (see /proc/cpuinfo) |
| cgroup | v2 unified (`/sys/fs/cgroup` cgroup2). `cpu.max` = `max 100000` → **no CPU quota**; `cpuset.cpus.effective` = `0-7` (all 8); `memory.max` = `max` → no memory quota |
| kernel | 6.8.0-1061-aws |
| governor | none — no cpufreq sysfs, no intel_pstate (paravirt): governor/turbo **not observable from guest**; clock is whatever the host gives |
| RAM | 31 GiB |
| host/OS | Ubuntu 22.04 on AWS (kernel string `-aws`) |

## Client/server topology (the big caveat)

**Load generator and server SHARE all 8 cores.** autocannon/wrk2 run on the same
box as the subject, over loopback TCP. No pinning (`taskset`/`cset`) is used —
on an 8-vCPU box splitting 4/4 starves both sides and doubles noise, so the
suite opts for the standard "loopback, shared cores" setup used by the
referenced suites. Consequence: numbers measure **server + kernel + client
combined**, are capped lower than a dedicated-client rig, and interleave with
VM-neighbor noise. Medians-of-N mitigate drift, not the ceiling. Expect
**±50% variance across runs/VMs**; treat any single absolute rps as ±10-20% even
within a run.

## Toolchain versions

| tool | version |
|------|---------|
| node | v24.19.0 |
| bun | 1.4.3 |
| scriptc | 0.2.8 (program-code build, `--optimization=speed` — never `--npm-static`, see below) |
| autocannon | 8.0.0 |
| wrk2 | 4.0.0 (giltene/wrk2, built from source; fixed-rate + `-L` corrected spectrum) |
| clang | Ubuntu clang 14.0.0 (scriptc linker) |
| gcc | 11.4.0 (c-mongoose, `-O2`) |
| go | go1.18.1 |
| rustc/cargo | 1.97.1 (release build) |
| docker | 29.7.2 (repro path, not used for the reported numbers) |

## Package versions

h3 2.0.2 · hono 4.13.13 · @hono/node-server 2.1.4 · find-my-way 9.10.0 · express 5.3.0 · fastify 5.12.5 · chi v5.0.12 (pinned for go1.18) · axum 0.8.9 · mongoose 7.19 (vendored single-file, patched to accept POST without Content-Length — see the local patch in `ceilings/mongoose.c`)

## Chttp build provenance

`chttp-scriptc` and `chttp-fast-scriptc` are **program-code** ELFs:
`scriptc build apps/chttp{,-fast}.ts --optimization=speed`, compiled from
`devin/compiled-mode` sources grafted into this branch. The
`--npm-static` path was measured earlier at a 40-70% throughput cliff and is
deliberately not reported (see `RESULTS-compiled-mode.md`).

## Methodology mapping

- **Canonical suite** (`run.sh`): autocannon `-c64 -d6`, json cell median of 5, others median of 3. Reports rps, p50, p90, p97.5, p99, p99.9, max, MB/s, errors, timeouts, non-2xx.
- **web-frameworks suite** (`run.sh`, cells `root`/`user`/`postuser`): GET `/` empty 2xx, GET `/user/:id` echoes param, POST `/user` empty 2xx — their canonical 3-route spec, on every subject. (Their runner uses `oha`, not wrk2; our fixed-rate wrk2 pass is the analogous latency-first check.)
- **wrk2 cross-validation** (`run-latency.sh`): `-t4 -c64 -d10 -R 0.8×<autocannon median>` with `-L` detailed percentile spectrum (coordinated-omission corrected). This is the latency-first analog of web-frameworks' LATENCY_RATE pass and supplies the exact p95 autocannon cannot (its percentile set is fixed: 50/75/90/97.5/99/99.9).
- **fastify parity** (`run.sh`, cell `json-p10`): `autocannon -c100 -p10 -d10 x3` on `/json`, matching fastify/benchmarks' `-c100 -d40 -p10` shape (shortened duration).
- **Raygun mirror** (`run.sh`, cell `hello`): GET `/hello` → `Hello World!` plaintext. Raygun's published series used ApacheBench `-c100`, same host, 5 reps averaged, one process, and emphasized p99 + RSS — no public harness exists (documented in REPRODUCE.md); we mirror the workload description and report p99 + RSS-after-100k.
- **Cold start**: spawn → first HTTP 200 on `/json`, median of 10 (`lib/coldstart.mjs`).
- **RSS**: `ps -o rss` on the server PID immediately after a 100k-request `/json` run.
