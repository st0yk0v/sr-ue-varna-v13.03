#!/usr/bin/env bash
# Full allow-list key-based deploy (mirrors scripts/deploy.sh semantics using the
# uev_deploy ed25519 key). Per-file scp + byte-diff verify + OPcache reset + CDN bust.
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="92.113.18.239"; PORT="65002"; USER="u129919172"
WEB="domains/sr-ue-varna.com/public_html"
KEY="/c/Users/999/.ssh/uev_deploy"
KNOWN="/c/Users/999/.ssh/known_hosts"
SSH_OPT=(-o "Port=$PORT" -o StrictHostKeyChecking=accept-new -o "UserKnownHostsFile=$KNOWN" -o ConnectTimeout=20 -i "$KEY")
VERSION="$(grep -m1 '"version"' "$REPO/version.json" | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/;s/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
FILES=(
  ".htaccess"
  "index.html"
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
  "js/db-data-viewer.js"
  "database/config.php"
  "database/stream-doc.php"
  "database/export-download.php"
  "database/doc-stream.php"
  "database/doc-stream-op.php"
  "database/proxy-doc.php"
  "database/veda_handlers.php"
  "database/veda_sync_worker.php"
  "database/_v18_bridge.php"
  "database/_v18_handlers.php"
  "database/opcache-reset.php"
  "database/orcid_oauth.php"
  "database/orcid_login_callback.php"
  "database/action_map.php"
  "database/export_handlers.php"
  "database/handlers_templates_bridge.php"
  "database/schema_v12513.php"
  "database/sql_service_extensions.php"
  "database/en_messages.php"
)
PASS=0; FAIL=0; MISS=0
echo "FULL KEY-DEPLOY v$VERSION -> $USER@$HOST:$PORT:$WEB (${#FILES[@]} files)"

# ── Pre-deploy gate: silent-unrouted-action routing audit ──
# Recurring defect class (caught 3x in reconciliation: 12.49.55 2FA,
# 12.49.56 batch-compliance, 12.49.57 admin-CRUD): a served JS file calls
# api('ACTION') that resolves to NEITHER a PHP handler NOR _GAS_ONLY, so it
# 404s at PHP and silently falls through to GAS (wasting a round-trip, and
# failing outright in PHP-only degraded mode). Run before any upload so a
# broken release can never ship. Gate is additive and non-blocking to the
# upload on its own absence, but FAILS the deploy when it finds a defect.
# Fix MSYS path translation: node needs Windows-style paths on Windows
REPO_WIN="$(cygpath -w "$REPO" 2>/dev/null || echo "$REPO")"
if command -v node >/dev/null 2>&1 && [[ -f "$REPO/scripts/verify-routing-audit.cjs" ]]; then
  echo "Pre-deploy gate: routing audit (verify-routing-audit.cjs)..."
  if ! node "$REPO_WIN/scripts/verify-routing-audit.cjs" --root "$REPO_WIN"; then
    echo "  GATE FAILED: unrouted api() action(s) found. ABORTING deploy."
    exit 2
  fi
  echo "  routing audit PASSED."
else
  echo "  WARNING: node or verify-routing-audit.cjs missing — skipping routing gate."
fi

for rel in "${FILES[@]}"; do
  local_src="$REPO/$rel"; remote="$USER@$HOST:$WEB/$rel"
  if [[ ! -f "$local_src" ]]; then echo "  ! $rel MISSING locally"; MISS=$((MISS+1)); continue; fi
  if ! scp -p "${SSH_OPT[@]}" "$local_src" "$remote" >/dev/null 2>&1; then echo "  x $rel UPLOAD FAILED"; FAIL=$((FAIL+1)); continue; fi
  tmp="$(mktemp)"; scp -p "${SSH_OPT[@]}" "$USER@$HOST:$WEB/$rel" "$tmp" >/dev/null 2>&1
  if diff -q <(tr -d '\r' < "$local_src") <(tr -d '\r' < "$tmp") >/dev/null 2>&1; then
    PASS=$((PASS+1))
  else
    echo "  x $rel VERIFY MISMATCH"; FAIL=$((FAIL+1))
  fi
  rm -f "$tmp"
done
echo "OPcache reset (web SAPI)..."
# v12.49.53-fix: CLI opcache_reset() only clears the CLI process cache, NOT the
# web/FPM SAPI cache that actually serves requests. Drop a tiny script into
# public_html, request it over HTTPS (runs under web SAPI — clears all FPM
# workers), then remove it. Mirrors canonical deploy-putty.sh.
OPC_FILE="$WEB/_opcache_clear.php"
timeout 25 ssh "${SSH_OPT[@]}" "$USER@$HOST" "printf '%s' '<?php opcache_reset(); echo \"OPCACHE_CLEARED\";' > '$OPC_FILE'" >/dev/null 2>&1
if curl -sS --max-time 20 "https://sr-ue-varna.com/_opcache_clear.php" 2>/dev/null | grep -q "OPCACHE_CLEARED"; then
  echo "  OPcache cleared (web SAPI)."
else
  echo "  WARNING: web-SAPI OPcache clear failed — falling back to CLI (may not clear FPM)."
  timeout 25 ssh "${SSH_OPT[@]}" "$USER@$HOST" "cd '$WEB' && php -r 'opcache_reset();'" >/dev/null 2>&1
fi
timeout 25 ssh "${SSH_OPT[@]}" "$USER@$HOST" "rm -f '$OPC_FILE'" >/dev/null 2>&1
echo "CDN cache-bust probes (expect 200)..."
for u in "https://sr-ue-varna.com/?v=$VERSION" "https://sr-ue-varna.com/js/views-bundle.js?v=$VERSION" "https://sr-ue-varna.com/js/features/doc-stream/DocStreamClient.js?v=$VERSION" "https://sr-ue-varna.com/database/metrics.php"; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$u")"; echo "  $code  $u"
done
echo "DONE: $PASS ok, $FAIL fail, $MISS missing"
