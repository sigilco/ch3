# Reproduce

## One-command (Docker)

From the repo root:

```bash
docker compose -f bench/docker-compose.yml up --build
```

or without compose:

```bash
docker build -f bench/Dockerfile -t chttp-bench .
docker run --rm -v "$PWD/bench/results:/work/bench/results" \
                 -v "$PWD/bench/results-wrk2:/work/bench/results-wrk2" chttp-bench
```

The image installs node 24, bun, scriptc, go, rust, clang, and builds wrk2 +
all subjects including the program-code scriptc ELFs, then runs `run.sh` and
`run-latency.sh` back to back. Results land in `bench/results{,-wrk2}/`.
Full run time: ~60-90 min inside a container on an 8-vCPU box.

Caveat: Docker numbers are container+host kernel measurements; they reproduce
*relative* ordering, not host-loopback absolutes.

## Bare metal

```bash
# toolchain: node 24, bun, `npm i -g scriptc`, clang, gcc, go, cargo,
#            wrk2 built from https://github.com/giltene/wrk2 (see bench/Dockerfile)
cd bench
npm ci
# build ceilings + scriptc ELFs (same commands as bench/Dockerfile RUN lines)
bash run.sh            # autocannon matrix  -> results/*.jsonl
bash run-latency.sh    # wrk2 fixed-rate    -> results-wrk2/*.jsonl
node lib/render-results.mjs > RESULTS-v2.md  # aggregated tables to stdout
```

Subset: `bash run.sh raw-node chttp-node fastify-node` /
`bash run-latency.sh raw-node`. wrk2 rates derive from each subject's
autocannon median, so run `run.sh` first.

## What each piece proves

| artifact | proves |
|----------|--------|
| `results/*.jsonl` | autocannon -c64 -d6 reps; median rps + full percentiles per cell |
| `results/*-p10` (`json-p10`) | fastify-parity pipeline workload (-c100 -p10) |
| `results-wrk2/*.jsonl` | wrk2 -L corrected latency at 80% of autocannon rate; true p95/p99/max |
| `results/*.meta.jsonl` | cold start (spawn→200, med10), RSS after 100k reqs, binary size |

## Notes on referenced methodologies

- **fastify/benchmarks**: `autocannon -c 100 -d 40 -p 10` with a warmup round;
  published as req/s + latency + throughput. Mirrored as the `json-p10` cell
  (same shape, `-d10`).
- **the-benchmarker/web-frameworks**: canonical routes GET `/` (empty 2xx),
  GET `/user/:id` (param echo), POST `/user` (empty 2xx) — implemented on all
  subjects as cells `root`/`user`/`postuser`. Their runner actually uses
  `oha` (keep-alive off) plus an optional `LATENCY_RATE` fixed-rate latency
  pass; we mirror the fixed-rate idea with wrk2 `-R -L` instead of adopting
  oha as a third tool.
- **Raygun HTTP benchmark series**: blog-only methodology — ApacheBench `-c100`,
  `Hello World!` plaintext GET, load gen on the same host, 5 reps averaged,
  single process, RSS tracked. **No public harness/repo exists**; mirrored
  as the `hello` cell + p99 + RSS-after-100k columns.
- **mongoose patch**: stock mongoose 7.19 requires Content-Length on POST/PUT
  and would stall on `POST /user` (autocannon sends none). `ceilings/mongoose.c`
  carries a marked patch treating missing Content-Length as an empty body.
