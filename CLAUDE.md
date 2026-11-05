# portfolio

## gstack
Use Garry Tan's gstack skills for all work. Use `/browse` from gstack for all web browsing. Never use mcp__claude-in-chrome__* tools.

Sprint order (do not skip):
`/office-hours` → `/autoplan` → build → `/review` → `/qa` (or tests) → `/ship`

## Roles → required gstack skills
- Local `builder`: `/office-hours`, `/autoplan`, `/plan-eng-review` as needed; dispatch cloud lanes; merge after gates. Never implement a cloud lane's owned files.
- Local `reviewer`: `/review` (and `claude ultrareview` when useful). Optional `/design-review` / `/devex-review`. Never implement features.
- Cloud lanes: implement only their LANES.md scope on their branch. Before done: tests/smoke green, commit, hand to reviewer for `/review`. Use `/careful` near risky edits. Do not `/ship` unless reviewer signed off and `gh` is available.

## Done means
- Tests or smoke checks pass
- `/review` clean enough to ship
- One PR per lane; no half-finished lanes; no squashing multiple lanes into one PR

## Layout
- Tab `build`: nvim + local Claude Ultra (planner)
- Tab `review`: Claude Ultra reviewer
- Tab `cloud`: cloud Claude sessions (`claude --cloud …`)
- Tab `ops`: tests, lazygit, btop
