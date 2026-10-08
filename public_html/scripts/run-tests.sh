#!/usr/bin/env bash
# Run every PHP contract test in tests/ plus the JS/handler guards.
# Usage: bash scripts/run-tests.sh
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

fails=0
run() {
  local label="$1"; shift
  echo ""
  echo "──── $label ────"
  if "$@"; then
    echo "PASS: $label"
  else
    echo "FAIL: $label"
    fails=$((fails + 1))
  fi
}

echo "═══ PHP syntax ═══"
syntax_fail=0
while IFS= read -r f; do
  if ! out=$(php -l "$f" 2>&1); then
    echo "$out"
    syntax_fail=$((syntax_fail + 1))
  fi
done < <(find database tests -name '*.php' 2>/dev/null)
if [ "$syntax_fail" -eq 0 ]; then
  echo "OK: all PHP files parse"
else
  echo "FAIL: $syntax_fail file(s) with syntax errors"
  fails=$((fails + syntax_fail))
fi

for t in tests/*_test.php; do
  [ -e "$t" ] || continue
  run "$(basename "$t")" php "$t"
done

if [ -f scripts/_audit_php_handlers.cjs ]; then
  run "handler audit (dangling routes)" node scripts/_audit_php_handlers.cjs
fi
if [ -f scripts/verify-php-constants.php ]; then
  run "undefined PHP constants" php scripts/verify-php-constants.php
fi
if [ -f scripts/verify-no-fake-success.php ]; then
  run "laundered failures (fake success)" php scripts/verify-no-fake-success.php
fi
if [ -f scripts/verify-routing-audit.cjs ]; then
  run "routing audit (unrouted actions)" node scripts/verify-routing-audit.cjs
fi
if [ -f scripts/verify-cache-buster.cjs ]; then
  run "cache-buster guard" node scripts/verify-cache-buster.cjs
fi
if [ -f scripts/verify-deploy-manifest.cjs ]; then
  run "deploy manifest guard" node scripts/verify-deploy-manifest.cjs
fi
if [ -f scripts/verify-preview-contract.cjs ]; then
  run "prop-contract guard" node scripts/verify-preview-contract.cjs
fi

echo ""
echo "════════════════════════════════"
if [ "$fails" -eq 0 ]; then
  echo "ALL SUITES PASSED"
  exit 0
fi
echo "$fails SUITE(S) FAILED"
exit 1
