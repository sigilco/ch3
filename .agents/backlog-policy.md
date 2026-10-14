# Backlog policy

Project: https://github.com/orgs/sigilco/projects/3 (chttp).
All project operations go through `ghx` (gh wrapper on this machine).

## Refinement

A task is refined when all four hold:

1. **Iteration/Quarter** set, mapping to a milestone in [docs/roadmap.md](../docs/roadmap.md).
2. **Effort** estimate (S/M/L/XL), including testing and bug-potential per contact surface.
3. **Start date + Target date**, scheduled in the roadmap.
4. **Classification**: `feature` / `bug` / `cosmetic` / `infra`.

Draft items are acceptable during research; refine before code lands.

## Workflow

1. Plans go to `.agents/plans/<date>-<purpose>.md` and must exist on disk before implementation begins.
2. Tasks are refined into the project before implementation.
3. Implementation is atomic: one logical change per commit, conventional commit format.
4. On completion: close the item and keep `docs/roadmap.md` milestone status honest (done / in progress / blocked, with the blocker named).

## Field mapping (GitHub project)

| Policy field | Project field |
| --- | --- |
| Iteration/Quarter | Iteration (quarter text also lives in the roadmap) |
| Effort | Effort (S/M/L/XL) |
| Start/Target | Start date / Target date |
| Classification | Label |

## Status conventions

- Blocked items carry the blocker in the item body. Example: the compiled-Hono bench cell is blocked because scriptc 0.3.1 cannot serve Hono at all (core dispatch is a fenced site); evidence in `bench/scriptc-evidence/`. Revisit on scriptc releases.
- Work explored in a parallel session (frontend hypothesis) gets its own items; this repo's M1/M2 items never depend on it.
