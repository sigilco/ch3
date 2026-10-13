---
tags:
- ch3
- scriptc
- async
- bench
- debugging
- decision
---
# ch3 async/scriptc study (2026-10-13, IN FLIGHT)

Goal: async perf vs sync under scriptc; node:http+async feasibility; reuse ch3's node async impl under scriptc; adversarial async/await alternatives.

## Hard facts (verified)
- scriptc 0.2.10 installed; v0.3.0 dropped 2026-10-12 (native-only, `--dynamic`/JS runtime removed, ABI v14).
- async/await IS supported by installed 0.2.10: stackful fibers + native event loop (kqueue/epoll), microtasks native (how-it-works.mdx:78; corpus 1020-1029 async, 2010-2019 generators, fiberless-async-ordering.ts).
- Scriptc repo cloned at ~/.opensrc/repos/github.com/vercel-labs/scriptc/main (opensrc; it is v0.3.0 source).
- @scriptc/threads exists (v0.2.8+): zero-copy immutable-graph sharing between native worker threads, `publish()` (freezes; Promise/Date/RegExp NOT publishable).
- ch3 async-era src (HEAD 15e32ec) does NOT typecheck under scriptc as-is: index.ts ~173 Array.isArray narrowing on req.headers union fails. `typeof v === "string"` narrowing collapses rest of union to never (0.2.10 bug). Fix: headersDistinct (`string[] | undefined`) 2-arm narrowing works (corpus 2972 precedent). SEMANTIC CHANGE of that patch: first-value instead of comma-join on repeated headers.
- After that one patch: coverage 100% static.
- ALL FOUR async variants passed coverage 100%: ch3 app w/ async handler, raw node:http async, real await expr, then-chain. So async/await syntax compiles under installed 0.2.10.
- `--optimization=speed` link is SLOW (~15+ min CPU-bound clang, 38 objects). Default opt builds much faster. Plan benches on default OR budget link time.
- macOS gotchas that burned the subagent: background builds die when tool-call bash exits (process group kill); no setsid; use daemonized launcher (runbg.sh in scratch) or `tsp -S 1`.
- unplugin emit gap for async: emit.ts:113 wraps chains in SYNC `_guard` closures -> generated dispatch would DROP a returned Promise (unhandled rejection risk). route-contract.md:132 "Sync only" clause + route-contract.md:91 `_guard` sync-wrap are the contract-level blockers. Root AGENTS.md also still bans async (docs lag src; src has thenable check since 15e32ec).

## In flight (cancelled subagents left state)
- /tmp/ch3-async-study/: patched index.ts, gen.ts, app.ts (sync+promise routes), base/ variants (raw-sync, raw-then, raw-async, app-async, async-await-expr, async-suite.ts runtime test), split/ = SRP module split of index.ts (passes coverage, 630 stmts = monolith parity), runbg.sh launcher.
- One clang link STILL RUNNING (async-suite binary, default opt) as of handoff. Check `ps aux | grep clang`.
- NO binaries completed yet. Tasks left: build+curl smoke (A/B), autocannon matrix (C), reuse verdict (D), adversarial writeup (E: fibers=native, CPS via unplugin, @scriptc/threads per-request offload, generators, thread-pool blocking).

## Resume pointers
- Original plan file: ~/.local/state/maki/plans/sharp-chief-dory.md (repo hygiene, DONE through task 11).
- This study was user-requested follow-up (assess async/scriptc). Study prompt skeleton exists in session; re-prompt with partial findings inline.
