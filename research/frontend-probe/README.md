# Frontend / scriptc probe

Live compile-and-serve evidence for whether chttp can grow a frontend library.
Findings: [`.agents/docs/2026-10-14-frontend-framework.md`](../../.agents/docs/2026-10-14-frontend-framework.md).

## Requirements

- Node ≥ 24 (scriptc 0.3.1 engine range)
- `scriptc` 0.3.1 on `PATH`
- clang/gcc for the ELF link

## Run

```sh
node run.mjs                          # coverage all probes; build the clean ones
./.out/20-islands-app 18081           # then curl localhost:18081 and /api/count
node --experimental-strip-types probes/21-escape-bench.ts split 5000
./.out/21-escape-bench split 5000
node ssg.mjs                          # Node-side prerender of lib/html.ts
```

`.out/` is gitignored (ELFs + coverage dumps).

## Layout

| path | what |
|---|---|
| `lib/html.ts` | Candidate library surface (tagged template, `Html` brand, escape, `h`, `joinHtml`) |
| `probes/*.ts` | One-constraint programs; 19-jsx.tsx is the expected JSX refusal |
| `ssg.mjs` | Build-host SSG sketch (subset-exempt) |
| `run.mjs` | Coverage + selected `scriptc build` driver |
