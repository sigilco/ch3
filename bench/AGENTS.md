# bench AGENTS.md

Benchmark harness for chttp vs ceilings (go-chi, rust-axum, c-mongoose).

## Usage

- `./run.sh` - full cell matrix. Warmup via autocannon, measured via wrk2 per cell.
- `./run-latency.sh` - latency-focused runs.
- Autocannon used for warmup and spot checks; wrk2 is the measurement driver.

## Rules

- Re-run the relevant cell after touching dispatch or handler paths in `packages/chttp/src`. Do not make perf claims from stale numbers.
- Results files (`RESULTS-*.md`) are append-only evidence. Add new dated sections; never rewrite or delete prior entries.
- `ceilings/` and vendored `mongoose.c` are intentional. Never lint or format vendored C.
- Ceiling numbers are measurement ceilings for context, not targets chttp must hit.
