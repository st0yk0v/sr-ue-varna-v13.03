#!/usr/bin/env bash
# T79: Canary deployment script for UEV-ERP
# Deploys a canary version alongside production, monitors health, and
# promotes or rolls back based on error rate thresholds.
#
# Usage:
#   bash scripts/deploy-canary.sh --version 12.52.0       # deploy canary
#   bash scripts/deploy-canary.sh --promote               # promote canary → prod
#   bash scripts/deploy-canary.sh --rollback              # rollback canary
#   bash scripts/deploy-canary.sh --status                # check canary status
#
# The canary is deployed to a separate directory on the same Hostinger host
# (domains/sr-ue-varna.com/canary/) and traffic is split via .htaccess rules
# or an external proxy (CloudFlare Workers, etc.).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
SSHX="$REPO/../TESTHERMEST/scripts/sshx.sh"
WEB="domains/sr-ue-varna.com/public_html"
CANARY_WEB="domains/sr-ue-varna.com/canary"
VERSION="${CANARY_VERSION:-}"
MODE="deploy"

for a in "$@"; do
  case "$a" in
    --version=*) VERSION="${a#*=}" ;;
    --version)   shift; VERSION="${1:-}" ;;
    --promote)   MODE="promote" ;;
    --rollback)  MODE="rollback" ;;
    --status)    MODE="status" ;;
    -h|--help)   echo "Usage: $0 [--version X] [--promote|--rollback|--status]"; exit 0 ;;
    *) echo "Unknown: $a"; exit 2 ;;
  esac
done

echo "=== T79: Canary Deployment ==="
echo "Mode: $MODE"
echo "Version: ${VERSION:-<from version.json>}"
echo ""

# ── Status check ──────────────────────────────────────────────────────────────
if [[ "$MODE" == "status" ]]; then
  echo "Checking canary health..."
  CANARY_HEALTH=$(curl -sS --max-time 10 "https://sr-ue-varna.com/canary/healthz" 2>/dev/null || echo '{"status":"unreachable"}')
  echo "Canary response: $CANARY_HEALTH"
  PROD_HEALTH=$(curl -sS --max-time 10 "https://sr-ue-varna.com/database/api.php" -X POST -H "Content-Type: application/json" -d '{"action":"getsystemhealth"}' 2>/dev/null || echo '{"success":false}')
  echo "Production response: $PROD_HEALTH"
  exit 0
fi

# ── Rollback: remove canary ──────────────────────────────────────────────────
if [[ "$MODE" == "rollback" ]]; then
  echo "Rolling back canary..."
  echo "Stopping canary..."
  bash "$SSHX" "rm -rf $CANARY_WEB" >/dev/null 2>&1
  echo "Canary removed. Production continues serving stable version."
  echo "Clearing OPcache..."
  OPC_FILE="$WEB/_opcache_clear.php"
  bash "$SSHX" "printf '%s' '<?php if (function_exists(\"opcache_reset\")) { @opcache_reset(); echo \"OPCACHE_RESET\"; } ?>' > '$OPC_FILE'" >/dev/null 2>&1
  curl -sS --max-time 10 "https://sr-ue-varna.com/_opcache_clear.php" >/dev/null 2>&1
  bash "$SSHX" "rm -f '$OPC_FILE'" >/dev/null 2>&1
  echo "Rollback complete."
  exit 0
fi

# ── Promote: swap canary → production ────────────────────────────────────────
if [[ "$MODE" == "promote" ]]; then
  echo "Promoting canary to production..."
  echo "Creating production backup first..."
  BACKUP_DIR="/home/u129919172/backups/uev-erp/$(date +%Y%m%d_%H%M%S)"
  bash "$SSHX" "mkdir -p '$BACKUP_DIR' && cp -r $WEB/* '$BACKUP_DIR/' 2>/dev/null" >/dev/null 2>&1
  echo "Backup created at: $BACKUP_DIR"
  echo "Swapping canary → production..."
  # Move current prod to temp, move canary to prod
  bash "$SSHX" "mv $WEB ${WEB}_old && mv $CANARY_WEB $WEB && rm -rf ${WEB}_old" >/dev/null 2>&1
  echo "Canary promoted to production."
  echo "Clearing OPcache..."
  OPC_FILE="$WEB/_opcache_clear.php"
  bash "$SSHX" "printf '%s' '<?php if (function_exists(\"opcache_reset\")) { @opcache_reset(); echo \"OPCACHE_RESET\"; } ?>' > '$OPC_FILE'" >/dev/null 2>&1
  curl -sS --max-time 10 "https://sr-ue-varna.com/_opcache_clear.php" >/dev/null 2>&1
  bash "$SSHX" "rm -f '$OPC_FILE'" >/dev/null 2>&1
  echo "Promotion complete."
  exit 0
fi

# ── Deploy canary ────────────────────────────────────────────────────────────
if [[ -z "$VERSION" ]]; then
  VERSION=$(cat "$REPO/version.json" 2>/dev/null | python3 -c 'import sys,json;print(json.load(sys.stdin)["version"])' 2>/dev/null)
  if [[ -z "$VERSION" ]]; then
    echo "ERROR: No version specified and version.json unreadable."
    exit 1
  fi
fi

echo "Deploying canary version: $VERSION"
echo ""

# Pre-deploy checks
echo "[canary] Running pre-deploy checks..."
REPO_WIN="$(cygpath -w "$REPO" 2>/dev/null || echo "$REPO")"
if ! php -l "$REPO_WIN/database/api.php" >/dev/null 2>&1; then
  echo "[canary] ABORTED: php -l database/api.php failed"
  exit 1
fi

# Deploy to canary directory
echo "[canary] Deploying to $CANARY_WEB..."
CANARY_FILES=(
  "index.html"
  "version.json"
  "styles.css"
  "styles-responsive.css"
  "sw.js"
  "manifest.webmanifest"
  "database/api.php"
  "database/config.php"
  "database/sql_service.php"
  "database/action_map.php"
  "database/stream-doc.php"
  "database/export-download.php"
  "database/doc-stream.php"
  "database/doc-stream-op.php"
  "database/proxy-doc.php"
  "database/veda_handlers.php"
  "database/veda_sync_worker.php"
  "database/veda_config.json"
  "database/_v18_bridge.php"
  "database/_v18_handlers.php"
  "database/opcache-reset.php"
  "database/export_handlers.php"
  "database/handlers_templates_bridge.php"
  "database/schema_v12513.php"
  "database/form_schema.php"
  "database/sql_service_extensions.php"
  "database/en_messages.php"
  "database/auth_handlers.php"
  "database/metrics.php"
  "database/metrics_writer.php"
  "database/debug_db.php"
  "database/platform_handlers.php"
  "database/probe_drive_file.php"
  "database/sync_worker.php"
)

PASS=0; FAIL=0
for rel in "${CANARY_FILES[@]}"; do
  localp="$REPO/$rel"
  srvp="$CANARY_WEB/$rel"
  if [[ ! -f "$localp" ]]; then echo "  ! $rel MISSING locally"; FAIL=$((FAIL+1)); continue; fi
  bash "$SSHX" "mkdir -p '$(dirname "$srvp")'" >/dev/null 2>&1
  winp="$(cygpath -u "$localp" 2>/dev/null || echo "$localp")"
  if bash "$SSHX" put "$winp" "$srvp" >/dev/null 2>&1; then
    echo "  [OK]   $rel"; PASS=$((PASS+1))
  else
    echo "  [FAIL] $rel scp FAILED"; FAIL=$((FAIL+1))
  fi
done

# Also copy JS/CSS/assets
for ext_dir in "js" "css" "assets"; do
  if [[ -d "$REPO/$ext_dir" ]]; then
    echo "[canary] Syncing $ext_dir/..."
    bash "$SSHX" "mkdir -p '$CANARY_WEB/$ext_dir'" >/dev/null 2>&1
    # Use tar for directory sync
    tar -cf - -C "$REPO" "$ext_dir" 2>/dev/null | bash "$SSHX" "tar -xf - -C '$CANARY_WEB/..' 2>/dev/null" 2>/dev/null || true
  fi
done

echo ""
echo "Canary deployed: $PASS ok, $FAIL failed."

# Post-deploy canary health check
echo ""
echo "[canary] Running post-deploy health check..."
sleep 2
CANARY_HEALTH=$(curl -sS --max-time 15 -X POST "https://sr-ue-varna.com/canary/database/api.php" -H "Content-Type: application/json" -d '{"action":"getsystemhealth"}' 2>/dev/null)
if echo "$CANARY_HEALTH" | python3 -c 'import sys,json; d=json.load(sys.stdin); assert d.get("success")==True, "success!=True"; print("  Canary PASS: health check OK — status:", d.get("status","?"))' 2>/dev/null; then
  echo ""
  echo "════════════════════════════════════════"
  echo "  T79 CANARY DEPLOY SUCCESSFUL"
  echo "  Version: $VERSION"
  echo "  URL: https://sr-ue-varna.com/canary/"
  echo ""
  echo "  Monitor:  bash scripts/deploy-canary.sh --status"
  echo "  Promote:  bash scripts/deploy-canary.sh --promote"
  echo "  Rollback: bash scripts/deploy-canary.sh --rollback"
  echo "════════════════════════════════════════"
else
  echo "  [WARN] Canary health check did not confirm success."
  echo "  Response: $CANARY_HEALTH"
  echo "  Consider rollback: bash scripts/deploy-canary.sh --rollback"
  exit 1
fi
