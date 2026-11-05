# portfolio

## gstack
Use /browse from gstack for all web browsing. Never use mcp__claude-in-chrome__* tools.

## Roles
- Local `builder`: plan with `/office-hours` and `/autoplan`, then implement or dispatch cloud lanes.
- Local `reviewer`: Claude-only review (`/review`, `claude ultrareview`).
- Cloud lanes: one feature scope per `claude --cloud` session; disjoint files/PRs.

## Done means
- Tests or smoke checks pass
- `/review` clean enough to ship
- PR or commit ready; no half-finished lanes

## Layout
- Tab `build`: nvim + local Claude Ultra
- Tab `review`: Claude Ultra reviewer
- Tab `cloud`: cloud Claude sessions (`claude --cloud …`)
- Tab `ops`: tests, lazygit, btop
