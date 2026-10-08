#!/usr/bin/env bash
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSHX="$REPO/../TESTHERMEST/scripts/sshx.sh"
KNOWN="/c/Users/999/.ssh/known_hosts"
HOST="92.113.18.239"; PORT="65002"; USER="u129919172"
WEB="domains/sr-ue-varna.com/public_html"
KEY="/c/Users/999/.ssh/uev_deploy"
KNOWN="/c/Users/999/.ssh/known_hosts"
SSH_OPT=(-o "Port=$PORT" -o StrictHostKeyChecking=accept-new -o "UserKnownHostsFile=$KNOWN" -o ConnectTimeout=20 -i "$KEY")
# wizardAdminApi.js is served with a cache-buster; bump handled in index.html already.
FILES=("database/api.php" "database/action_map.php" "js/features/proposal-wizard/api/wizardAdminApi.js")
PASS=0; FAIL=0
echo "DEPLOY wizard-admin wiring -> $USER@$HOST:$PORT"
for rel in "${FILES[@]}"; do
  local_src="$REPO/$rel"; remote="$USER@$HOST:$WEB/$rel"
  if [[ ! -f "$local_src" ]]; then echo "  ! $rel MISSING"; FAIL=$((FAIL+1)); continue; fi
  if ! scp -p "${SSH_OPT[@]}" "$local_src" "$remote" >/dev/null 2>&1; then echo "  x $rel UPLOAD FAILED"; FAIL=$((FAIL+1)); continue; fi
  tmp="$(mktemp)"; scp -p "${SSH_OPT[@]}" "$USER@$HOST:$WEB/$rel" "$tmp" >/dev/null 2>&1
  if diff -q <(tr -d '\r' < "$local_src") <(tr -d '\r' < "$tmp") >/dev/null 2>&1; then PASS=$((PASS+1)); else echo "  x $rel MISMATCH"; FAIL=$((FAIL+1)); fi
  rm -f "$tmp"
done
echo "Clearing OPcache (web SAPI)..."
# CLI `php -r "opcache_reset()"` only clears the CLI process cache, NOT the
# web/FPM SAPI that serves traffic. Drop a script into public_html, request it
# over HTTP (runs under web SAPI), then remove it. Mirrors deploy-putty.sh.
OPC_FILE="$WEB/_opcache_clear.php"
bash "$SSHX" "printf '%s' '<?php opcache_reset(); echo \"OPCACHE_CLEARED\";' > '$OPC_FILE'" >/dev/null 2>&1
if curl -sS --max-time 20 "https://sr-ue-varna.com/_opcache_clear.php" 2>/dev/null | grep -q "OPCACHE_CLEARED"; then
  echo "  OPcache cleared (web SAPI)."
else
  echo "  [WARN] web OPcache clear did not confirm; falling back to CLI reset."
  timeout 25 ssh "${SSH_OPT[@]}" "$USER@$HOST" "cd '$WEB' && php -r 'opcache_reset();'" >/dev/null 2>&1
fi
bash "$SSHX" "rm -f '$OPC_FILE'" >/dev/null 2>&1
echo "DONE: $PASS ok, fails=$FAIL"
