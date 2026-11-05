# Headless browser launcher shared by the smoke scripts. Source it; do not execute.
# Extracted from lane-1's scripts/smoke-home (render check) per eng review R3/R7.
#
#   browser_skip_render            returns 0 (and prints "SKIP render") when SMOKE_SKIP_RENDER=1
#   browser_pick                   sets BROWSER to the first candidate that renders; returns 1 if none.
#                                  Call it directly (not inside $(...)): a subshell would lose BROWSER.
#   browser_dump_dom <url>         prints the rendered DOM using BROWSER (call browser_pick first)
#   browser_run <chromium args...> runs BROWSER isolated, e.g. --screenshot=...
#   browser_env                    browser_pick, then exports CHROMIUM + isolated HOME/XDG for child processes
#   browser_cleanup                removes the launcher's temp dir; call it from the caller's own EXIT trap
#
# Policy (R7): if no candidate renders, browser_pick prints the browser log tail and returns 1.
# There is no silent skip; SMOKE_SKIP_RENDER=1 is the only way to skip, and it is printed.
# Env: CHROMIUM=/path pins one browser; PLAYWRIGHT_BROWSERS_PATH adds Playwright's headless shell.
#
# This file sets no trap: a sourced trap would replace (or be replaced by) the caller's EXIT trap.

_browser_tmp="$(mktemp -d)"
BROWSER=""

browser_cleanup() { rm -rf "$_browser_tmp"; }

browser_skip_render() {
  if [[ "${SMOKE_SKIP_RENDER:-0}" == 1 ]]; then echo "  SKIP render (SMOKE_SKIP_RENDER=1)"; return 0; fi
  return 1
}

_browser_candidates() {
  if [[ -n "${CHROMIUM:-}" ]]; then echo "$CHROMIUM"; return; fi
  local c
  for c in chromium chromium-browser google-chrome google-chrome-stable; do
    command -v "$c" 2>/dev/null || true
  done
  ls -1d "${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"/chromium_headless_shell-*/*/chrome-headless-shell \
    2>/dev/null | sort -r || true
}

browser_run() {
  # Isolated HOME/XDG/profile: the browser never writes to the user's config (and works where it is read-only).
  HOME="$_browser_tmp/home" XDG_CONFIG_HOME="$_browser_tmp/cfg" XDG_CACHE_HOME="$_browser_tmp/cache" \
    "$BROWSER" --headless --no-sandbox --disable-gpu --disable-crash-reporter --no-first-run --hide-scrollbars \
    --user-data-dir="$_browser_tmp/profile" --virtual-time-budget="${BROWSER_BUDGET_MS:-5000}" "$@" \
    2>>"$_browser_tmp/browser.log"
}

browser_pick() {
  local c
  BROWSER=""
  while IFS= read -r c; do
    [[ -n "$c" ]] || continue
    BROWSER="$c"
    if [[ -n "$(browser_run --dump-dom "about:blank")" ]]; then return 0; fi
    echo "  info $(basename "$c") could not render, trying next" >&2
  done < <(_browser_candidates)
  BROWSER=""
  echo "  FAIL no headless browser could render (set CHROMIUM=/path, or SMOKE_SKIP_RENDER=1 to skip); log tail:" >&2
  grep -v crashpad "$_browser_tmp/browser.log" 2>/dev/null | tail -5 >&2 || true
  return 1
}

browser_env() {
  # For tests that launch the browser themselves (lane-3's Node CDP test, R8): export the picked
  # browser plus isolated dirs so the child process inherits both.
  [[ -n "$BROWSER" ]] || browser_pick || return 1
  mkdir -p "$_browser_tmp/home" "$_browser_tmp/cfg" "$_browser_tmp/cache"
  export CHROMIUM="$BROWSER" HOME="$_browser_tmp/home" \
    XDG_CONFIG_HOME="$_browser_tmp/cfg" XDG_CACHE_HOME="$_browser_tmp/cache"
}

browser_dump_dom() {
  [[ -n "$BROWSER" ]] || { echo "  FAIL browser_dump_dom: call browser_pick first" >&2; return 1; }
  browser_run --dump-dom "$1"
}
