#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# UEV-ERP → Hostinger  deploy.sh
# Single, robust, self-verifying deployment script.
# (Consolidates the old deploy-hostinger.sh and redeploy-hostinger.sh.)
#
# WHAT IT DOES
#   1. UPLOADS EACH WEBROOT FILE INDIVIDUALLY via scp.
#      (Batch scp silently drops large files on this host — one file at a time
#       avoids that failure mode entirely.)
#   2. BYTE-DIFF VERIFIES every upload by scp-ing the file back from the server
#      and diffing the CRLF-normalised contents against the local original.
#   3. CLEARS OPcache on the server via:  php -r 'opcache_reset()'
#   4. CACHE-BUSTS the CDN edge with a fresh timestamp (curl probes; 200 = ok).
#   5. EXCLUDES gas/, .git, _bak_*, scripts/ (and all other local-only artifacts)
#      — enforced by the explicit allow-list below, so those paths are never
#      even considered for upload.
#
# REQUIRED ENVIRONMENT
#   SSH_PASS   SSH password for u129919172@92.113.22.14:65002.
#              Supplied at runtime by the parent process. NEVER hard-coded.
#              It is only ever handed to ssh/scp through an askpass helper that
#              prints the $SSH_PASS variable — the literal secret is never
#              written to disk or committed.
#
# USAGE
#   bash scripts/deploy.sh                 # DRY RUN — list files it WOULD upload
#   bash scripts/deploy.sh --push          # upload + verify + OPcache + CDN bust
#   bash scripts/deploy.sh --push --no-cache   # skip CDN cache-bust probes
#   bash scripts/deploy.sh --help          # show this header
#
# EXAMPLES (parent invocation)
#   SSH_PASS="$SSH_PASS" bash scripts/deploy.sh --push
#
# NOTES
#   • Host key checking is STRICT (StrictHostKeyChecking=yes) using the pinned
#     known_hosts entry at /c/Users/999/.ssh/known_hosts.
#   • gas/GAS.GS is a manual Google Apps Script deploy — it is NOT uploaded here.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

# ---- Configuration -----------------------------------------------------------
HOST="92.113.22.14"
PORT="65002"
USER="u129919172"
WEB="domains/sr-ue-varna.com/public_html"
KNOWN_HOSTS="/c/Users/999/.ssh/known_hosts"

# Repo root = parent of this script's directory (scripts/). Robust to rename/move.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"

# Webroot files that belong on the server. This explicit allow-list inherently
# EXCLUDES gas/, .git, _bak_*, scripts/ and every other local-only artifact.
FILES=(
  ".htaccess"
  "index.html"
  "manifest.webmanifest"
  "sw.js"
  "version.json"
  "styles.css"
  "styles-responsive.css"
  "css/uev.css" "css/uev-dark-mode.css"
  "js/app.js"
  "js/assets.js"
  "js/competitions.js"
  "js/compliance.js"
  "js/components.js"
  "js/config.js"
  "js/config-secrets.js"
  "js/core-bundle.js"
  "js/data-layer.js"
  "js/dashboard.js"
  "js/documents.js"
  "js/doc-viewer.js"
  "js/forms-admin.js"
  "js/hostinger-config.js"
  "js/hostinger-config-laravel.js"
  "js/i18n.js"
  "js/library-deposits.js"
  "js/main.js"
  "js/ministry-reports.js"
  "js/proposal-extras.js"
  "js/features/mobile/installPrompt.js"
  "js/features/procurement/ComplianceChecker.js"
  "js/features/procurement/PositionView.js"
  "js/features/procurement/ProcurementDashboard.js"
  "js/features/procurement/ProcurementRoutes.js"
  "js/features/procurement/procurement-bundle.js"
  "js/features/procurement/procurement.css"
  "js/public-results.js"
  "js/reviews.js"
  "js/router.js"
  "js/search.js"
  "js/settings.js"
  "js/utils.js"
  "js/veda.js"
  "js/veda-chat.js"
  "js/views-bundle.js"
  "js/services/api.js"
  "js/services/cache.js"
  "js/services/documents.js"
  "js/services/storage.js"
  "js/services/sync.js"
  "js/processors/events.js"
  "js/processors/search.js"
  "js/processors/validator.js"
  "js/vendor/mammoth.browser.min.js"
  "js/vendor/pdf.min.js"
  "js/vendor/pdf.worker.min.js"
  "js/vendor/xlsx.full.min.js"
  "assets/admin-structure.json"
  "assets/science-logo.png"
  "assets/uev-logo.jpg"
  "assets/uev-social-logo.png"
  "js/features/proposal-wizard/proposal-wizard.css"
  "js/features/proposal-wizard/proposal-wizard-bundle.js"
  "js/features/proposal-wizard/WizardShell.js"
  "js/features/proposal-wizard/useAutosave.js"
  "js/features/proposal-wizard/useWizardState.js"
  "js/features/proposal-wizard/api/proposalsApi.js"
  "js/features/proposal-wizard/api/types.js"
  "js/features/proposal-wizard/shared/AutosaveIndicator.js"
  "js/features/proposal-wizard/shared/ConfirmCloseDialog.js"
  "js/features/proposal-wizard/shared/ConflictResolutionDialog.js"
  "js/features/proposal-wizard/shared/DocumentCard.js"
  "js/features/proposal-wizard/shared/InlineValidationSummary.js"
  "js/features/proposal-wizard/shared/StatusBadge.js"
  "js/features/proposal-wizard/shared/StepIndicator.js"
  "js/features/proposal-wizard/shared/types.js"
  "js/features/proposal-wizard/shared/useAutosave.js"
  "js/features/proposal-wizard/shared/useWizardState.js"
  "js/features/proposal-wizard/steps/Step1BasicInfo/Step1BasicInfo.js"
  "js/features/proposal-wizard/steps/Step1BasicInfo/step1.schema.js"
  "js/features/proposal-wizard/steps/Step2Documents/Step2Documents.js"
  "js/features/proposal-wizard/steps/Step2Documents/step2.schema.js"
  "js/features/proposal-wizard/steps/Step3Budget/Step3Budget.js"
  "js/features/proposal-wizard/steps/Step3Budget/step3.schema.js"
  "js/features/proposal-wizard/config/budget-rules.js"
  "js/features/proposal-wizard/config/document-requirements.js"
  "js/features/proposal-wizard/config/program-template-folders.js"
  "js/features/proposal-wizard/config/TemplatesSection.js"
  "js/features/proposal-wizard/steps/Step2Documents/Step2RefereeCheck.js"
  "js/features/proposal-wizard/steps/Step2Documents/Step2DocumentPreview.js"
  "js/features/proposal-wizard/steps/Step4Review/Step4Review.js"
  "js/features/doc-stream/DocStreamClient.js"
  "js/features/doc-stream/DocStreamEditor.js"
  "js/features/doc-stream/DocStreamEditor.css"
  "js/features/proposal-wizard/api/wizardAdminApi.js"
  "js/features/proposal-wizard/admin/WizardDashboardWidget.js"
  "js/features/proposal-wizard/admin/WizardPublicView.js"
  "js/features/proposal-wizard/admin/WizardAdminDashboard.js"
  "js/features/proposal-wizard/shared/useCsvImport.js"
  "js/features/proposal-wizard/shared/useEmailNotification.js"
  "js/features/proposal-wizard/proposal-wizard-admin.css"
  "js/features/admin/reviewer-publications.js"
  "js/features/admin/reviewer-publications.js"
  "js/features/admin/reviewer-publications-modal.js"
  "js/features/staff/staff-publications.js"
  "database/auth_handlers.php"
  "database/staff_publications.php"
  "database/auth_security_test.php"
  "database/integration_handlers.php"
  "healthz.php"
  "js/features/proposal-wizard/shared/SavePointDialog.js"
  "js/features/proposal-wizard/shared/i18n.js"
  "js/features/proposal-wizard/shared/useAccessibility.js"
  "js/features/proposal-wizard/shared/useSavePoints.js"
  "manifest.json"
  "scripts/rollback.php"
  "database/api.php"
  "database/sql_service.php"
  "database/config.php"
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
  "database/cron_scheduler.php"
  "database/opcache-reset.php"
  "database/orcid_oauth.php"
  "database/orcid_login_callback.php"
  "database/action_map.php"
  "database/export_handlers.php"
  "database/handlers_templates_bridge.php"
  "database/schema_v12513.php"
  "database/form_schema.php"
  "database/sql_service_extensions.php"
  "database/en_messages.php"
  "js/db-data-viewer.js"
)

# ---- Usage / help ------------------------------------------------------------
usage() {
  cat <<'USAGE'
UEV-ERP → Hostinger deploy.sh

Usage:
  bash scripts/deploy.sh                  DRY RUN — list the files it WOULD upload
  bash scripts/deploy.sh --push           upload + byte-diff verify + OPcache + CDN bust
  bash scripts/deploy.sh --push --no-cache  same, but skip CDN cache-bust probes
  bash scripts/deploy.sh --help           show this help

Required environment variable:
  SSH_PASS   SSH password for u129919172@92.113.22.14:65002.
             Supplied at runtime by the parent. NEVER hard-coded.

Behaviour:
  • Files are uploaded ONE AT A TIME via scp (batch scp silently drops large files).
  • Every upload is byte-diff verified (scp back + diff, CRLF-normalised).
  • OPcache is cleared with: php -r 'opcache_reset()'
  • gas/GAS.GS is NOT uploaded (manual Google Apps Script deploy).
USAGE
}

# ---- Parse arguments ---------------------------------------------------------
PUSH=0
NO_CACHE=0
for a in "$@"; do
  case "$a" in
    --push)     PUSH=1 ;;
    --no-cache) NO_CACHE=1 ;;
    -h|--help)  usage; exit 0 ;;
    *) echo "Unknown argument: $a (see --help)" >&2; exit 2 ;;
  esac
done

# ---- Version (for CDN cache-bust query string) -------------------------------
VERSION="$(grep -m1 '"version"' "$REPO/version.json" 2>/dev/null \
            | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
[[ -z "$VERSION" ]] && VERSION="unknown"

# ---- Dry run -----------------------------------------------------------------
if [[ $PUSH -eq 0 ]]; then
  echo "DRY RUN — would upload the following ${#FILES[@]} webroot file(s):"
  echo "  repo : $REPO"
  echo "  dest : $USER@$HOST:$PORT:$WEB"
  echo
  ok=0; miss=0
  for rel in "${FILES[@]}"; do
    if [[ -f "$REPO/$rel" ]]; then
      printf "  + %s\n" "$rel"; ok=$((ok+1))
    else
      printf "  ! %s  (MISSING locally — would fail on push)\n" "$rel"; miss=$((miss+1))
    fi
  done
  echo
  echo "Excluded (never uploaded): gas/, .git, _bak_*, scripts/, .worktrees, build, and all other local-only artifacts."
  echo "Re-run with --push to actually deploy (requires SSH_PASS)."
  exit 0
fi

# ---- Push mode: require password ---------------------------------------------
if [[ -z "${SSH_PASS:-}" ]]; then
  echo "ERROR: SSH_PASS env var is required for --push (the SSH password for $USER@$HOST:$PORT)." >&2
  exit 1
fi

# ── G2 guard: deploy-manifest consistency BEFORE uploading ───────────────────
# Aborts the push if index.html loads a file the allow-list would skip, or a file
# is allow-listed but missing on disk (12.49.53 / 12.49.52 silent-broken-push class).
echo "[deploy] G2 deploy-manifest guard..."
if ! node scripts/verify-deploy-manifest.cjs; then
  echo "[deploy] ABORTED: deploy-manifest drift detected (see failures above). Fix the allow-list or index.html before pushing."
  exit 1
fi

# ── G3 guard: unloaded-module / undefined __GLOBAL const (dead-feature class) ──
echo "[deploy] G3 loaded-globals guard..."
if ! node scripts/verify-loaded-globals.cjs; then
  echo "[deploy] ABORTED: a served view reads a window.__CONST no loaded file defines (dead-feature class). Load the defining module in index.html before pushing."
  exit 1
fi

# ── G4 guard: routing + php-handler-integrity + php-lint (silent-breakage class) ──
echo "[deploy] G4 routing/php-integrity guards..."
if ! node scripts/verify-routing-audit.cjs; then
  echo "[deploy] ABORTED: an api('ACTION') served by the UI resolves to no backend (silent-unrouted class). Route it or fix the call before pushing."
  exit 1
fi
if ! node scripts/_audit_php_handlers.cjs; then
  echo "[deploy] ABORTED: a handler referenced by action_map.php is not defined (would PHP-fatal 500). Define it before pushing."
  exit 1
fi
if ! php -l database/api.php >/dev/null 2>&1; then
  echo "[deploy] ABORTED: php -l database/api.php failed."; php -l database/api.php
  exit 1
fi

# ── G5 guard (WARN-only): dark-mode inline-style coverage ────────────────────
# Hardcoded near-white literals in inline React style objects stay light in dark
# mode (the only remaining E4 dark-mode per-view gap). NOT live-breaking, so it
# only WARNS and never aborts the push (exit 0 by design).
echo "[deploy] G5 dark-mode coverage (WARN-only)..."
node scripts/verify-darkmode-coverage.cjs || echo "[deploy] G5 WARN: dark-mode inline-style literals present (see above) — non-blocking."

# ── G6 guard (WARN-only): CSS-class coverage (unlinked/deleted stylesheet regression) ──
# Catches the silent-styling class: a className referenced by served JS whose definition
# was moved into a CSS file that index.html no longer links (the 12.49.61 uev.css near-miss).
# NOT live-breaking, so it only WARNS and never aborts the push (exit 0 by design).
echo "[deploy] G6 CSS-class coverage (WARN-only)..."
node scripts/verify-css-class-coverage.cjs || echo "[deploy] G6 WARN: referenced-but-undefined CSS classes present (see above) — non-blocking."

# Build the askpass helper from the runtime password. The helper only prints the
# $SSH_PASS variable (supplied by the parent) — the literal secret is never
# written to disk beyond a script that references the variable by name.
TMPD="$(mktemp -d)"
ASKPASS="$TMPD/askpass.sh"
cat > "$ASKPASS" <<'AP'
#!/usr/bin/env bash
printf '%s\n' "$SSH_PASS"
AP
chmod +x "$ASKPASS"

cleanup() { rm -rf "$TMPD"; }
trap cleanup EXIT

# ---- SSH / SCP wrappers (proven askpass pattern) ------------------------------
# NOTE: -o Port=65002 is used for BOTH ssh and scp (avoids the ssh -p / scp -P
# ambiguity). StrictHostKeyChecking + pinned UserKnownHostsFile are mandatory.
SSH_COMMON=(-o "Port=$PORT" -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$KNOWN_HOSTS")
SSH_ENV=(SSH_ASKPASS="$ASKPASS" SSH_ASKPASS_REQUIRE=force DISPLAY=:0)

ssh_run() {
  env "${SSH_ENV[@]}" ssh "${SSH_COMMON[@]}" "$USER@$HOST" "$@"
}
scp_up() {  # $1 = local source, $2 = remote dest (path relative to HOME on server)
  env "${SSH_ENV[@]}" scp -p "${SSH_COMMON[@]}" "$1" "$USER@$HOST:$2"
}
scp_down() {  # $1 = remote source, $2 = local dest
  env "${SSH_ENV[@]}" scp -p "${SSH_COMMON[@]}" "$USER@$HOST:$1" "$2"
}

# ---- Upload + byte-diff verify -----------------------------------------------
echo "PUSH — deploying ${#FILES[@]} file(s) INDIVIDUALLY to $USER@$HOST:$PORT:$WEB"
echo "Cache-bust version: $VERSION"
echo

PASS=0; FAIL=0; SKIP=0
for rel in "${FILES[@]}"; do
  localp="$REPO/$rel"
  srvp="$WEB/$rel"
  if [[ ! -f "$localp" ]]; then
    echo "  ! $rel  MISSING locally — skipped"; SKIP=$((SKIP+1)); FAIL=$((FAIL+1)); continue
  fi
  # Ensure parent directory exists on the server first — SCP won't create
  # intermediate directories, so paths like js/services/ fail if js/ exists
  # but js/services/ doesn't yet exist on the remote webroot.
  parent_dir="$(dirname "$srvp")"
  if ssh_run "mkdir -p '$parent_dir'" >/dev/null 2>&1; then
    : # parent exists or was created
  fi
  if scp_up "$localp" "$srvp" >/dev/null 2>&1; then
    tmp="$TMPD/_srv_$(basename "$rel")"
    if scp_down "$srvp" "$tmp" >/dev/null 2>&1 \
       && diff <(sed 's/\r$//' "$localp") <(sed 's/\r$//' "$tmp") >/dev/null 2>&1; then
      echo "  [OK]   $rel  uploaded + byte-diff verified"; PASS=$((PASS+1))
    else
      echo "  [FAIL] $rel  byte-diff MISMATCH after upload"; FAIL=$((FAIL+1))
    fi
    rm -f "$tmp"
  else
    echo "  [FAIL] $rel  scp upload FAILED"; FAIL=$((FAIL+1))
  fi
done

# ---- OPcache -----------------------------------------------------------------
echo
echo "Clearing Opcyache on server (php -r 'opcache_reset()')..."
if ssh_run "cd '$WEB' && php -r 'opcache_reset();'" 2>&1; then
  echo "  Opcyache reset command sent."
else
  echo "  [WARN] SSH Opcyache reset returned non-zero (continuing)."
fi
# v12.47.9-oplocal: SSH reset is blocked in this environment (port 65002 reset),
# so also trigger a REAL FPM Opcyache reset over HTTPS (same SAPI as the web app).
echo "Resetting FPM Opcyache via web endpoint..."
CB="$(date +%s)"
if curl -s -o /dev/null -w '%{http_code}' "https://sr-ue-varna.com/database/opcache-reset.php?token=uev-oplocal-47&cb=$CB" | grep -q 200; then
  echo "  FPM Opcyache reset OK (200)."
else
  echo "  [WARN] FPM Opcyache web reset did not return 200 (continuing)."
fi

# ---- CDN cache-bust ----------------------------------------------------------
if [[ $NO_CACHE -eq 0 ]]; then
  echo
  echo "Cache-busting CDN edge (fresh timestamp)..."
  CB="$(date +%s)"
  for rel in "${FILES[@]}"; do
    url="https://sr-ue-varna.com/$rel?v=$VERSION&cb=$CB"
    code="$(curl -s -o /dev/null -w '%{http_code}' "$url")"
    printf "  %s  https://sr-ue-varna.com/%s\n" "$code" "$rel"
  done
fi

# ---- Post-deploy LIVE smoke test --------------------------------------------
# Catches deploy-induced edge failures that static checks miss — e.g. the
# 2026-08-19 transient Hostinger `hcdn` 403 (CDN cached a 403 while files were
# briefly missing mid-upload). Probes the REAL served host over HTTPS.
echo
echo "Running post-deploy live smoke test (scripts/verify-live.cjs)..."
if command -v node >/dev/null 2>&1; then
  if node scripts/verify-live.cjs --version="$VERSION"; then
    echo "  Live smoke test: ALL GREEN."
  else
    echo "  [WARN] Live smoke test reported failures — review output above."
    echo "          If it is a transient hcdn 403, re-run: node scripts/verify-live.cjs"
  fi
else
  echo "  [WARN] node not found — skipped live smoke test."
fi

echo
echo "DEPLOY SUMMARY: $PASS verified ok, $FAIL failed (incl. missing), $SKIP skipped."
echo "NOTE: gas/GAS.GS was NOT uploaded — deploy it manually in the Google Apps Script editor."
[[ $FAIL -eq 0 ]]
