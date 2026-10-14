# Adversarial frontend paths (scriptc 0.3.1)

One ELF serves a CSR bundle, a sync `@kitajs/html` component page, an escaping MVP, a baked SSG string, and a 2s ISR cache.

```bash
export PATH="$PWD/../../examples/vite-elf/node_modules/.bin:$PATH"
scriptc build server.ts -o /tmp/adv-server --optimization=speed
/tmp/adv-server   # :3860
```

See `.agents/docs/adversarial-frontend-paths-2026-10-14.md`.
