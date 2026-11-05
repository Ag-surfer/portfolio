# portfolio

## gstack
Use Garry Tan's gstack skills for all work. Use `/browse` from gstack for all web browsing. Never use mcp__claude-in-chrome__* tools.

Sprint order (do not skip):
`/office-hours` → `/autoplan` → build → `/review` → `/qa` (or tests) → `/ship`

## Roles → required gstack skills
- Local `builder`: `/office-hours`, `/autoplan`, `/plan-eng-review` as needed; dispatch cloud lanes; merge after gates. Never implement a cloud lane's owned files.
- Local `reviewer`: `/review` (and `claude ultrareview` when useful). Optional `/design-review` / `/devex-review`. Never implement features.
- Cloud lanes: implement only their LANES.md scope on their branch. Before done: tests/smoke green, commit, hand to reviewer for `/review`. Use `/careful` near risky edits. Do not `/ship` unless reviewer signed off and `gh` is available.

## Git remote
- `origin` = https://github.com/Ag-surfer/portfolio (public). Push your own branch only; never push another lane's branch.
- The GitHub token lives in the system keyring, which the Bash sandbox cannot reach (D-Bus blocked).
  Reads (`fetch`, `ls-remote`) work sandboxed. Run `git push` and `gh` write commands with the sandbox
  disabled; the owner approves each one. A sandboxed push fails with `could not read Username` — that is
  expected, not a credential problem: retry unsandboxed, don't change credential config or store tokens.
- Cloud lanes push through the Claude GitHub app, not the local token.

## Done means
<!-- gstack:verify: scripts/smoke --strict -->
- Tests or smoke checks pass (`scripts/smoke --strict` is the check `/verify` and `/ship` run)
- `/review` clean enough to ship
- One PR per lane; no half-finished lanes; no squashing multiple lanes into one PR

## Layout
- Tab `build`: nvim + local Claude Ultra (planner)
- Tab `review`: Claude Ultra reviewer
- Tab `cloud`: cloud Claude sessions (`claude --cloud …`)
- Tab `ops`: tests, lazygit, btop
