#!/usr/bin/env bash
# Syntax-check every browser JS file the shell ships. A parse error in any of
# these stops the app from mounting (blank page + the CORS/blocked banner).
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
count=0
while IFS= read -r f; do
  count=$((count + 1))
  if ! out=$(node --check "$f" 2>&1); then
    echo "  [FAIL] $f"
    echo "$out" | sed -n '1,3p' | sed 's/^/         /'
    fail=$((fail + 1))
  fi
done < <(find js -name '*.js' -not -path '*/node_modules/*' | sort)

echo
if [ "$fail" -eq 0 ]; then
  echo "=== Syntax OK: $count/$count files parse ==="
else
  echo "=== Syntax FAILED: $fail of $count files broken ==="
fi
exit "$fail"
