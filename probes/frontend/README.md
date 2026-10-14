# Frontend feasibility probes

Not a package. Each `src/*.ts` file is one scriptc question about shipping a
UI library on chttp (formerly ch3) and scriptc 0.3.1. Findings live in
`.agents/docs/2026-10-14-frontend-feasibility.md`.

```bash
npm install
bash run-node.sh
bash run-cover.sh
```

`src/lib/html.ts` is the conservative renderer the integration probes serve.
`lower/lower.mjs` is a Node-only template lowerer; scriptc compiles its output.
