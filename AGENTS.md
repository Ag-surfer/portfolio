# Agents

All five Claude agents use Garry Tan gstack skills (installed globally + team-required in this repo).

| Agent | Herdr | Skills |
|---|---|---|
| builder | build tab | `/office-hours` → `/autoplan` → steer / merge |
| reviewer | review tab | `/review`, optional `/design-review` |
| cloud1–3 | cloud tab | implement lane scope; smoke; commit for `/review` |

Builder: Claude Code (Ultra), local.
Reviewer: Claude Code (Ultra) — Claude only, no Codex.
Cloud workers: `claude --cloud "<lane>"` via `./scripts/spawn-cloud-lane`.

Local Herdr stays lean (planner + reviewer + ops). Fan out high-value feature work to cloud so OM RAM is not the bottleneck.
Every lane ends ready-to-merge under: `/review` → tests or `/qa` → `/ship` (one PR per lane).
