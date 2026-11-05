# Agents

Builder: Claude Code (Ultra), local.
Reviewer: Claude Code (Ultra) using `/review` and `claude ultrareview` — Claude only, no Codex.
Cloud workers: `claude --cloud "<lane>"` from the Herdr `cloud` tab (or `./scripts/spawn-cloud-lane`).

Local Herdr stays lean (planner + reviewer + ops). Fan out high-value feature work to cloud sessions so OM RAM is not the bottleneck.
Every lane must end ready-to-merge under the gate: `/review` → tests or `/qa` → `/ship`.
