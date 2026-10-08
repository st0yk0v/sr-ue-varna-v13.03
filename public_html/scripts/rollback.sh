#!/usr/bin/env bash
# T78: One-click rollback for UEV-ERP deployments.
# Restores the previous version from a backup stored on the server.
# Safety features: pre-rollback backup, DB dump, version verification.
#
# Usage:
#   bash scripts/rollback.sh              # interactive: pick from list
#   bash scripts/rollback.sh 12.51.1      # roll back to specific version
#   bash scripts/rollback.sh --auto       # non-interactive: rollback to previous
#   bash scripts/rollback.sh --list       # list available backups
#   bash scripts/rollback.sh --dry-run    # show what would be done
#
# Environment:
#   SSH_PASS or K9SSH_PASS — SSH password (required unless --list or --dry-run)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
HOST="92.113.18.239"
PORT="65002"
USER="u129919172"
DEPLOY_PATH="/home/${USER}/domains/sr-ue-varna.com/public_html"
BACKUP_PATH="/home/${USER}/backups/uev-erp"
DB_DUMP_PATH="/home/${USER}/backups/uev-erp-db"

# ── Parse args ──────────────────────────────────────────────────────────────
TARGET_VERSION=""
AUTO=0
LIST=0
DRY_RUN=0

for a in "$@"; do
  case "$a" in
    --auto)       AUTO=1 ;;
    --list)       LIST=1 ;;
    --dry-run)    DRY_RUN=1 ;;
    -h|--help)
      echo "Usage: $0 [--auto] [--list] [--dry-run] [version]"
      echo "  --auto     Non-interactive rollback to previous version"
      echo "  --list     List available backups"
      echo "  --dry-run  Show what would be done without executing"
      echo "  version    Specific version to roll back to (e.g. 12.51.1)"
      exit 0
      ;;
    *)
      if [[ "$a" != -* ]]; then TARGET_VERSION="$a"; fi
      ;;
  esac
done

SSH_PASS="${SSH_PASS:-${K9SSH_PASS:-}}"

if [[ $LIST -eq 1 ]]; then
  echo "=== Available backups on server ==="
  if [[ -n "$SSH_PASS" ]]; then
    export SSHPASS="$SSH_PASS"
    sshpass -e ssh -o StrictHostKeyChecking=no -p "$PORT" "$USER@$HOST" \
      "ls -1t $BACKUP_PATH/ 2>/dev/null | head -20 || echo 'No backups found'"
  else
    echo "SSH_PASS required to list remote backups."
    echo "Local version: $(cat "$REPO/version.json" 2>/dev/null | python3 -c 'import sys,json;print(json.load(sys.stdin)["version"])' 2>/dev/null || echo 'unknown')"
  fi
  exit 0
fi

if [[ -z "$SSH_PASS" ]]; then
  echo "ERROR: SSH_PASS or K9SSH_PASS required"
  exit 1
fi

export SSHPASS="$SSH_PASS"

echo "=== T78: One-Click Rollback ==="

# ── List available backups ──────────────────────────────────────────────────
echo ""
echo "Available backups on server:"
BACKUPS=$(ssh -o StrictHostKeyChecking=no -p "$PORT" "$USER@$HOST" \
  "ls -1 $BACKUP_PATH/ 2>/dev/null | grep -v 'pre-rollback' | sort -r | head -10")
if [ -z "$BACKUPS" ]; then
  echo "  No backups found on server."
  echo "  You can still rollback using a local version tag."
else
  echo "$BACKUPS" | while read -r b; do echo "  - $b"; done
fi

CURRENT=$(cat "$REPO/version.json" 2>/dev/null | python3 -c 'import sys,json;print(json.load(sys.stdin)["version"])' 2>/dev/null || echo "unknown")
echo "  Current local version: $CURRENT"

# ── Determine target version ────────────────────────────────────────────────
if [ -z "$TARGET_VERSION" ]; then
  if [[ $AUTO -eq 1 ]]; then
    # Non-interactive: pick the most recent backup that isn't current
    TARGET_VERSION=$(echo "$BACKUPS" | grep -v "$CURRENT" | head -1)
    if [ -z "$TARGET_VERSION" ]; then
      echo "ERROR: No previous backup found for auto-rollback."
      exit 1
    fi
    echo "Auto-rollback target: $TARGET_VERSION"
  else
    # Interactive: prompt user
    echo ""
    read -p "Enter version to rollback to (or 'q' to quit): " TARGET_VERSION
    if [ "$TARGET_VERSION" = "q" ] || [ -z "$TARGET_VERSION" ]; then
      echo "Rollback cancelled."
      exit 0
    fi
  fi
fi

echo "Rollback target: $TARGET_VERSION"

# ── Verify backup exists ────────────────────────────────────────────────────
BACKUP_EXISTS=$(ssh -o StrictHostKeyChecking=no -p "$PORT" "$USER@$HOST" \
  "[ -d '$BACKUP_PATH/$TARGET_VERSION' ] && echo 'yes' || echo 'no'")

if [ "$BACKUP_EXISTS" != "yes" ]; then
  echo "ERROR: Backup '$TARGET_VERSION' not found on server at $BACKUP_PATH/$TARGET_VERSION"
  echo "Available backups:"
  echo "$BACKUPS" | head -5
  exit 1
fi

# ── Dry run ─────────────────────────────────────────────────────────────────
if [[ $DRY_RUN -eq 1 ]]; then
  echo ""
  echo "=== DRY RUN ==="
  echo "  Would create pre-rollback backup of current state"
  echo "  Would create pre-rollback DB dump"
  echo "  Would restore files from: $BACKUP_PATH/$TARGET_VERSION/"
  echo "  Would clear OPcache"
  echo "  Would verify rollback via health check"
  echo "  Target: $USER@$HOST:$PORT:$DEPLOY_PATH"
  exit 0
fi

# ── Confirm rollback ────────────────────────────────────────────────────────
if [[ $AUTO -eq 0 ]]; then
  echo ""
  echo "============================================"
  echo "  ROLLBACK CONFIRMATION"
  echo "  Target version: $TARGET_VERSION"
  echo "  Server: $USER@$HOST:$PORT"
  echo "  Path:   $DEPLOY_PATH"
  echo "============================================"
  echo ""
  read -p "Type 'yes' to confirm rollback: " CONFIRM
  if [ "$CONFIRM" != "yes" ]; then
    echo "Rollback cancelled."
    exit 0
  fi
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# ── Step 1: Pre-rollback backup of current state ────────────────────────────
echo ""
echo "Step 1: Creating pre-rollback backup of current state..."
ssh -o StrictHostKeyChecking=no -p "$PORT" "$USER@$HOST" \
  "mkdir -p '$BACKUP_PATH/pre-rollback-${TIMESTAMP}' && cd '$DEPLOY_PATH' && find . -maxdepth 2 -type f \( -name '*.php' -o -name '*.js' -o -name '*.css' -o -name '*.json' -o -name '*.html' \) -exec cp --parents {} '$BACKUP_PATH/pre-rollback-${TIMESTAMP}/' \; && echo 'Pre-rollback backup saved'" \
  && echo "  Pre-rollback backup created: pre-rollback-${TIMESTAMP}" \
  || echo "  [WARN] Pre-rollback backup failed — continuing anyway"

# ── Step 2: Pre-rollback DB dump ────────────────────────────────────────────
echo ""
echo "Step 2: Creating pre-rollback database dump..."
ssh -o StrictHostKeyChecking=no -p "$PORT" "$USER@$HOST" \
  "mkdir -p '$DB_DUMP_PATH' && if command -v mysqldump >/dev/null 2>&1; then mysqldump -h localhost u129919172_db1 -u u129919172_dbadp --single-transaction 2>/dev/null | gzip > '$DB_DUMP_PATH/pre-rollback-${TIMESTAMP}.sql.gz' && echo 'DB dump saved' || echo 'DB dump failed'; else echo 'mysqldump not available'; fi" \
  || echo "  [WARN] DB dump failed — continuing"

# ── Step 3: Clear OPcache before restore ────────────────────────────────────
echo ""
echo "Step 3: Clearing OPcache..."
ssh -o StrictHostKeyChecking=no -p "$PORT" "$USER@$HOST" \
  "cd $DEPLOY_PATH && php -r 'if(function_exists(\"opcache_reset\"))opcache_reset();' 2>/dev/null" || true

# ── Step 4: Restore from backup ──────────────────────────────────────────────
echo ""
echo "Step 4: Restoring files from backup $TARGET_VERSION..."
sshpass -p "$SSH_PASS" rsync -avz --delete \
  -e "ssh -p $PORT -o StrictHostKeyChecking=no" \
  "$USER@$HOST:$BACKUP_PATH/$TARGET_VERSION/" \
  "$DEPLOY_PATH/" 2>&1 | tail -10

# ── Step 5: Clear OPcache after restore ─────────────────────────────────────
echo ""
echo "Step 5: Clearing OPcache post-restore..."
ssh -o StrictHostKeyChecking=no -p "$PORT" "$USER@$HOST" \
  "php -r 'if(function_exists(\"opcache_reset\"))opcache_reset();' 2>/dev/null" || true

# ── Step 6: Version verification ────────────────────────────────────────────
echo ""
echo "Step 6: Verifying rollback..."
sleep 2
LIVE_VERSION=$(curl -s --max-time 10 "https://sr-ue-varna.com/version.json" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['version'])" 2>/dev/null || echo "unknown")
echo "  Live version: $LIVE_VERSION"
echo "  Expected:     files from $TARGET_VERSION"

# ── Step 7: Health check ────────────────────────────────────────────────────
echo ""
echo "Step 7: Running health check..."
HEALTH=$(curl -s --max-time 10 -X POST "https://sr-ue-varna.com/database/api.php" \
  -H "Content-Type: application/json" \
  -d '{"action":"getversion"}' 2>/dev/null || echo '{"success":false}')
if echo "$HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('success')==True" 2>/dev/null; then
  echo "  Health check PASS: API responding."
else
  echo "  [WARN] Health check failed — investigate immediately."
  echo "  Response: $HEALTH"
fi

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "============================================"
echo "  Rollback to $TARGET_VERSION complete."
echo "  Pre-rollback backup: pre-rollback-${TIMESTAMP}"
echo "  To undo: bash scripts/rollback.sh $CURRENT"
echo "============================================"
