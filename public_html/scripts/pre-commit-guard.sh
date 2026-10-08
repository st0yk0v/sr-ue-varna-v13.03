#!/usr/bin/env bash
# UEV-ERP pre-commit guard (G4)
#
# Purpose: mechanically enforce the silent-breakage guard suite so the recurring
# "roadmap says no open work, but prod breaks on deploy" class (see ROADMAP-AGENT.md
# reconciliations 12.49.55 -> 12.49.58) can NEVER ship again.
#
# What it runs (all local, no network, fast):
#   G2 deploy-manifest      (BLOCK) index.html refs must resolve + be in deploy allow-lists
#   G3 loaded-globals       (BLOCK) every __GLOBAL read by served code must be defined
#   routing-unrouted        (BLOCK) every api('ACTION') must resolve to a real backend
#   php-handler-integrity   (BLOCK) every handler in action_map.php must be DEFINED (no dangling -> 500)
#   php-lint                (BLOCK) database/api.php must parse
#   G1 cache-buster         (WARN)  ?v= tokens should align to version.json (deploy gate also checks)
#
# BLOCK vs WARN: the BLOCK classes cause SILENT production breakage (404 / 500 / dead
# feature with a green-looking deploy). G1 is the deploy-time cache gate and is warn-only
# so intermediate WIP commits are not blocked mid-feature (the deploy --push still enforces it).
#
# Resilience: missing runtime or missing script => skip (warn), never block on tool failure.
set -u
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
[ -d "$ROOT" ] || exit 0
cd "$ROOT" || exit 0

LOG="/tmp/uev-precommit-$$.log"
BLOCK=0

have() { command -v "$1" >/dev/null 2>&1; }

# run_node <name> <block:0|1> <script-in-repo> [args...]
run_node() {
  local name="$1" block="$2" script="$3"; shift 3
  if ! have node; then echo "  [skip] $name (node missing)"; return 0; fi
  if [ ! -f "$ROOT/$script" ]; then echo "  [skip] $name (script $script missing)"; return 0; fi
  if node "$ROOT/$script" "$@" >"$LOG" 2>&1; then
    echo "  [ok]   $name"
  else
    echo "  [FAIL] $name"; tail -8 "$LOG"; [ "$block" = "1" ] && BLOCK=1
  fi
}

# run_php_lint <name> <block:0|1> <file>
run_php_lint() {
  local name="$1" block="$2" file="$3"
  if ! have php; then echo "  [skip] $name (php missing)"; return 0; fi
  if php -l "$ROOT/$file" >"$LOG" 2>&1; then
    echo "  [ok]   $name"
  else
    echo "  [FAIL] $name"; tail -8 "$LOG"; [ "$block" = "1" ] && BLOCK=1
  fi
}

echo "UEV-ERP pre-commit guards:"
run_node "G2 deploy-manifest"    1 scripts/verify-deploy-manifest.cjs
run_node "G3 loaded-globals"     1 scripts/verify-loaded-globals.cjs
run_node "routing-unrouted"      1 scripts/verify-routing-audit.cjs
run_node "php-handler-integrity" 1 scripts/_audit_php_handlers.cjs
run_node "sw-navigation-html"    1 scripts/verify-sw-navigation-html.cjs
# js-syntax (served) — run the shell wrapper directly (node --check over js/*.js)
if [ -f "$ROOT/scripts/check-js-syntax.sh" ]; then
  if bash "$ROOT/scripts/check-js-syntax.sh" >"$LOG" 2>&1; then
    echo "  [ok]   js-syntax (served)"
  else
    echo "  [FAIL] js-syntax (served)"; tail -8 "$LOG"; BLOCK=1
  fi
else
  echo "  [skip] js-syntax (served) (script missing)"
fi
# index.html structural integrity (12.51.24 leak class) — run via node directly
if [ -f "$ROOT/scripts/verify-index-html-structure.cjs" ]; then
  if node "$ROOT/scripts/verify-index-html-structure.cjs" "$ROOT" >"$LOG" 2>&1; then
    echo "  [ok]   index-html-structure"
  else
    echo "  [FAIL] index-html-structure"; tail -8 "$LOG"; BLOCK=1
  fi
else
  echo "  [skip] index-html-structure (script missing)"
fi
# Offline PWA manifest + service worker offline shell (12.51.27 deeplink class)
if [ -f "$ROOT/scripts/verify-offline.cjs" ]; then
  if node "$ROOT/scripts/verify-offline.cjs" "$ROOT" >"$LOG" 2>&1; then
    echo "  [ok]   offline-pwa"
  else
    echo "  [FAIL] offline-pwa"; tail -8 "$LOG"; BLOCK=1
  fi
else
  echo "  [skip] offline-pwa (script missing)"
fi
run_php_lint "php-lint database/api.php" 1 database/api.php
run_node "G1 cache-buster (warn)" 0 scripts/verify-cache-buster.cjs
run_node "G5 dark-mode coverage (warn)" 0 scripts/verify-darkmode-coverage.cjs
run_node "G6 css-class coverage (warn)" 0 scripts/verify-css-class-coverage.cjs

rm -f "$LOG"
if [ "$BLOCK" = "1" ]; then
  echo "PRE-COMMIT BLOCKED: a silent-breakage guard failed. Fix the defect before committing."
  echo "(Override with 'git commit --no-verify' only if you understand the risk.)"
  exit 1
fi
echo "PRE-COMMIT OK"
exit 0
