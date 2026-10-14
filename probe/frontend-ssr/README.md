# frontend-ssr probes (scriptc 0.3.1)

Ad-hoc feasibility checks for HTML/SSR on chttp + scriptc program-code. Not wired into CI.

See `.agents/docs/frontend-framework-feasibility-2026-10-14.md` for synthesis.

```bash
export PATH="$PWD/../../examples/vite-elf/node_modules/.bin:$PATH"
scriptc build server-chttp.ts -o /tmp/probe-ssr-server --optimization=speed
/tmp/probe-ssr-server   # :3847
```

Install scriptc once from repo root:

```bash
cd ../../examples/vite-elf && pnpm install --allow-build scriptc --allow-build esbuild
```
