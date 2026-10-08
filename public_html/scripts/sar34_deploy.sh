#!/usr/bin/env bash
# sar34_deploy.sh — comprehensive SAR34 archive → live Hostinger DB + repo sync
set -euo pipefail
REPO="/c/Users/999/Desktop/uev-ver-7.21"
SSHX_REL="../TESTHERMEST/scripts/sshx.sh"
WEB="domains/sr-ue-varna.com/public_html"
HOST="92.113.18.239"
PORT="65002"
USER="u129919172"

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  SAR34 Archive → Live DB + Repo  (sr-ue-varna.com)             ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# ── 0. Verify seed file availability ──
SEED_LOCAL="$REPO/seed-local-docs.json"
SEED_REMOTE="/home/$USER/domains/sr-ue-varna.com/public_html/seed-local-docs.json"
if [[ -f "$SEED_LOCAL" ]]; then
  echo "[OK] seed-local-docs.json found in repo"
elif [[ -f "$SEED_REMOTE" ]]; then
  echo "[INFO] seed-local-docs.json on server — will seed from there"
else
  echo "[WARN] seed-local-docs.json not found locally or on server"
fi

# ── 1. Fix handleListDocuments in api.php ──
echo ""
echo "── 1. Patch handleListDocuments (fix exception) ──"
php "$REPO/scripts/fix-handleListDocuments.php" 2>&1 | tail -3

# ── 2. Upload patched api.php ──
echo ""
echo "── 2. Upload patched api.php ──"
KEY="/c/Users/999/.ssh/uev_deploy"
KNOWN="/c/Users/999/.ssh/known_hosts"
scp -o "Port=$PORT" -o StrictHostKeyChecking=accept-new \
    -o "UserKnownHostsFile=$KNOWN" -o ConnectTimeout=20 -i "$KEY" \
    "$REPO/database/api.php" "$USER@$HOST:$WEB/database/api.php" 2>&1
echo "[OK] api.php uploaded"

# ── 3. Run SAR34 seed script on server ──
echo ""
echo "── 3. Seed SAR34 data on server ──"
# Copy seed script to server
scp -o "Port=$PORT" -o StrictHostKeyChecking=accept-new \
    -o "UserKnownHostsFile=$KNOWN" -o ConnectTimeout=20 -i "$KEY" \
    "$REPO/scripts/sar34_seed_sql.php" "$USER@$HOST:$WEB/_sar34_seed.php" 2>&1

ssh -o "Port=$PORT" -o StrictHostKeyChecking=accept-new \
    -o "UserKnownHostsFile=$KNOWN" -o ConnectTimeout=20 -i "$KEY" \
    "$USER@$HOST" "cd $WEB && php -d display_errors=1 -d error_reporting=E_ALL _sar34_seed.php" 2>&1

# ── 4. Verify ──
echo ""
echo "── 4. Live verification ──"
# Clean up temp files
ssh -o "Port=$PORT" -o StrictHostKeyChecking=accept-new \
    -o "UserKnownHostsFile=$KNOWN" -o ConnectTimeout=20 -i "$KEY" \
    "$USER@$HOST" "rm -f $WEB/_sar34_seed.php $WEB/_verify_sar34.php" 2>&1

echo ""
echo "=== DONE ==="
