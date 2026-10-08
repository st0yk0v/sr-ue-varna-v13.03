#!/usr/bin/env bash
# UEV-ERP → Hostinger redeploy via PuTTY (pscp/plink).
# Mirrors scripts/deploy.sh semantics but uses the proven TESTHERMEST/scripts/sshx.sh
# wrapper because native OpenSSH scp to port 65002 fails in this environment.
#
# Usage:
#   bash scripts/deploy-putty.sh            # dry run
#   bash scripts/deploy-putty.sh --push     # upload + verify + OPcache reset
#   bash scripts/deploy-putty.sh --push --no-cache  # skip CDN cache-bust
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
SSHX="$REPO/../TESTHERMEST/scripts/sshx.sh"
WEB="domains/sr-ue-varna.com/public_html"
KNOWN_HOSTS="/c/Users/999/.ssh/known_hosts"

# Same allow-list as deploy.sh — gas/, .git, scripts/ etc. are EXCLUDED.
FILES=(
  ".htaccess"
  "index.html"
  "manifest.webmanifest"
  "manifest.json"
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
  "js/features/proposal-wizard/shared/useSavePoints.js"
  "js/features/proposal-wizard/shared/SavePointDialog.js"
  "js/features/proposal-wizard/shared/useAccessibility.js"
  "js/features/proposal-wizard/shared/i18n.js"
  "js/features/proposal-wizard/proposal-wizard-admin.css"
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
  "database/opcache-reset.php"
  "database/orcid_oauth.php"
  "database/orcid_login_callback.php"
  "database/action_map.php"
  "database/export_handlers.php"
  "database/integration_handlers.php"
  "database/handlers_templates_bridge.php"
  "database/schema_v12513.php"
  "database/form_schema.php"
  "database/sql_service_extensions.php"
  "database/en_messages.php"
  "database/auth_handlers.php"
  "database/auth_security_test.php"
  "js/db-data-viewer.js"
  "healthz.php"
  "scripts/rollback.php"
)

PUSH=0
NO_CACHE=0
PRECHECK=0
PRECHECK_FIX=0
MANIFEST=0
GLOBALS=0
G4=0
for a in "$@"; do
  case "$a" in
    --push)       PUSH=1 ;;
    --no-cache)   NO_CACHE=1 ;;
    --precheck)   PRECHECK=1 ;;
    --precheck-fix) PRECHECK_FIX=1 ;;
    --manifest)   MANIFEST=1 ;;
    --globals)    GLOBALS=1 ;;
    --g4)         G4=1 ;;
    -h|--help)    echo "Usage: $0 [--push] [--no-cache] [--precheck] [--precheck-fix] [--manifest] [--globals] [--g4]"; exit 0 ;;
    *) echo "Unknown: $a"; exit 2 ;;
  esac
done

# ── G1 pre-deploy guard: cache-buster drift detection ─────────────────────────
# Run it manually before push to check + optionally auto-fix:
#   bash scripts/deploy-putty.sh --precheck        # check only
#   bash scripts/deploy-putty.sh --precheck-fix   # check + auto-bump ?v= if drifted
if [[ $PRECHECK -eq 1 || $PRECHECK_FIX -eq 1 ]]; then
  echo "[pre-deploy] running cache-buster guard..."
  REPO_WIN="$(cygpath -w "$REPO" 2>/dev/null || echo "$REPO")"
  if [[ $PRECHECK_FIX -eq 1 ]]; then
    node "$REPO_WIN/scripts/verify-cache-buster.cjs" --fix
  else
    node "$REPO_WIN/scripts/verify-cache-buster.cjs"
  fi
  exit $?
fi

# ── G2 pre-deploy guard: deploy-manifest consistency ───────────────────────
# Hard-fails the push if index.html loads a file the launcher would skip (or a
# file is allow-listed but missing on disk) — the 12.49.53 silent-broken-push
# class. Run manually: bash scripts/deploy-putty.sh --manifest
if [[ $MANIFEST -eq 1 ]]; then
  echo "[pre-deploy] running deploy-manifest guard..."
  REPO_WIN="$(cygpath -w "$REPO" 2>/dev/null || echo "$REPO")"
  node "$REPO_WIN/scripts/verify-deploy-manifest.cjs"
  exit $?
fi

# ── G3 pre-deploy guard: unloaded-module / undefined __GLOBAL const ──────────
# Hard-fails the push if a served view reads a `window.__X` const that no served
# file defines (the 12.49.44 doc-stream / 12.49.50 wizard-core / 12.49.51 wizard-admin
# silent-dead-feature class). Run manually: bash scripts/deploy-putty.sh --globals
if [[ $GLOBALS -eq 1 ]]; then
  echo "[pre-deploy] running loaded-globals guard..."
  REPO_WIN="$(cygpath -w "$REPO" 2>/dev/null || echo "$REPO")"
  node "$REPO_WIN/scripts/verify-loaded-globals.cjs"
  exit $?
fi

# ── G4 pre-deploy guard: routing + php-handler-integrity + php-lint ──────────
# Hard-fails the push if a served api('ACTION') resolves to no backend (the
# 12.49.55/56/57 silent-unrouted-action class) or a handler in action_map.php is
# undefined (would PHP-fatal 500 live). Run manually: bash scripts/deploy-putty.sh --g4
if [[ $G4 -eq 1 ]]; then
  echo "[pre-deploy] running G4 routing/php-integrity guards..."
  REPO_WIN="$(cygpath -w "$REPO" 2>/dev/null || echo "$REPO")"
  node "$REPO_WIN/scripts/verify-routing-audit.cjs" || exit 1
  node "$REPO_WIN/scripts/_audit_php_handlers.cjs" || exit 1
  if ! php -l "$REPO_WIN/database/api.php" >/dev/null 2>&1; then
    echo "[pre-deploy] ABORTED: php -l database/api.php failed"; php -l "$REPO_WIN/database/api.php"; exit 1
  fi
  echo "[pre-deploy] G4 OK"
  exit 0
fi

# ---- Dry run (no --push, no --precheck) ----
if [[ $PUSH -eq 0 ]]; then
  echo "DRY RUN — would upload ${#FILES[@]} file(s) to u129919172@92.113.22.14:$WEB"
  echo "  repo : $REPO"
  ok=0; miss=0
  for rel in "${FILES[@]}"; do
    [[ -f "$REPO/$rel" ]] && printf "  + %s\n" "$rel" && ok=$((ok+1)) || { printf "  ! %s  MISSING\n" "$rel"; miss=$((miss+1)); }
  done
  echo "Excluded: gas/, .git, _bak_*, scripts/, .worktrees"
  exit 0
fi

TMPD="$(mktemp -d)"

# ── G2 guard: run the deploy-manifest consistency check BEFORE uploading ──────
# Aborts the push if index.html loads a file this launcher would skip, or a file
# is allow-listed but missing on disk (12.49.53 / 12.49.52 incident class).
REPO_WIN="$(cygpath -w "$REPO" 2>/dev/null || echo "$REPO")"
echo "[deploy] G2 deploy-manifest guard..."
if ! node "$REPO_WIN/scripts/verify-deploy-manifest.cjs"; then
  echo "[deploy] ABORTED: deploy-manifest drift detected (see failures above). Fix the allow-list or index.html before pushing."
  rm -rf "$TMPD"
  exit 1
fi

# ── G3 guard: unloaded-module / undefined __GLOBAL const (dead-feature class) ──
echo "[deploy] G3 loaded-globals guard..."
if ! node "$REPO_WIN/scripts/verify-loaded-globals.cjs"; then
  echo "[deploy] ABORTED: a served view reads a window.__CONST no loaded file defines (dead-feature class). Load the defining module in index.html before pushing."
  rm -rf "$TMPD"
  exit 1
fi

# ── G4 guard: routing + php-handler-integrity + php-lint (silent-breakage class) ──
echo "[deploy] G4 routing/php-integrity guards..."
if ! node "$REPO_WIN/scripts/verify-routing-audit.cjs"; then
  echo "[deploy] ABORTED: an api('ACTION') served by the UI resolves to no backend (silent-unrouted class). Route it or fix the call before pushing."
  rm -rf "$TMPD"
  exit 1
fi
if ! node "$REPO_WIN/scripts/_audit_php_handlers.cjs"; then
  echo "[deploy] ABORTED: a handler referenced by action_map.php is not defined (would PHP-fatal 500). Define it before pushing."
  rm -rf "$TMPD"
  exit 1
fi
if ! php -l "$REPO_WIN/database/api.php" >/dev/null 2>&1; then
  echo "[deploy] ABORTED: php -l database/api.php failed."; php -l "$REPO_WIN/database/api.php"
  rm -rf "$TMPD"
  exit 1
fi

# ── G7 guard (BLOCK): service-worker navigation Content-Type (12.51.22 leak class) ──
# A navigation Response built in sw.js MUST force `Content-Type: text/html;
# charset=utf-8`. If it doesn't, a cached/transient bad-type copy makes the
# browser render index.html SOURCE as plain text on every refresh.
echo "[deploy] G7 sw-navigation text/html guard..."
if ! node "$REPO_WIN/scripts/verify-sw-navigation-html.cjs" "$REPO_WIN"; then
  echo "[deploy] ABORTED: sw.js navigation Response(s) do not force text/html (12.51.22 text-leak class). Fix sw.js before pushing."
  rm -rf "$TMPD"
  exit 1
fi

# ── G9 guard (BLOCK): index.html structural integrity (12.51.24 leak class) ──
# Raw JS outside a <script> block renders as visible page text and never runs.
echo "[deploy] G9 index.html structure guard..."
if ! node "$REPO_WIN/scripts/verify-index-html-structure.cjs" "$REPO_WIN"; then
  echo "[deploy] ABORTED: index.html has unbalanced <script> tags or raw JS in the body (12.51.24 leak class). Fix index.html before pushing."
  rm -rf "$TMPD"
  exit 1
fi

# ── G10 guard (BLOCK): Offline PWA manifest + service worker offline shell ──────
# A missing/broken manifest or a SW without offline shell fallback means the PWA
# install prompt never fires and deep-link refresh breaks offline (12.51.27 class).
echo "[deploy] G10 offline-PWA guard..."
if ! node "$REPO_WIN/scripts/verify-offline.cjs" "$REPO_WIN"; then
  echo "[deploy] ABORTED: offline-PWA guard failed (manifest missing/broken, SW no offline shell, or allow-list drift). Fix before pushing."
  rm -rf "$TMPD"
  exit 1
fi

# ── G8 guard (BLOCK): JS syntax of every served browser bundle ──────────────
# A parse error in any js/*.js stops the SPA from mounting (blank page). The
# check script exists but was orphaned; this makes it a hard gate at push time.
echo "[deploy] G8 JS syntax check (every served js/*.js)..."
if ! bash "$REPO/scripts/check-js-syntax.sh"; then
  echo "[deploy] ABORTED: a served JS file fails node --check (would white-screen the SPA). Fix the syntax before pushing."
  rm -rf "$TMPD"
  exit 1
fi

# ── G5 guard (WARN-only): dark-mode inline-style coverage ────────────────────
# Hardcoded near-white literals in inline React style objects stay light in dark
# mode (the only remaining E4 dark-mode per-view gap). NOT live-breaking, so it
# only WARNS and never aborts the push (exit 0 by design).
echo "[deploy] G5 dark-mode coverage (WARN-only)..."
node "$REPO_WIN/scripts/verify-darkmode-coverage.cjs" || echo "[deploy] G5 WARN: dark-mode inline-style literals present (see above) — non-blocking."

# ── G6 guard (WARN-only): CSS-class coverage (unlinked/deleted stylesheet regression) ──
# Catches the silent-styling class: a className referenced by served JS whose definition
# was moved into a CSS file that index.html no longer links (the 12.49.61 uev.css near-miss).
# NOT live-breaking, so it only WARNS and never aborts the push (exit 0 by design).
echo "[deploy] G6 CSS-class coverage (WARN-only)..."
node "$REPO_WIN/scripts/verify-css-class-coverage.cjs" || echo "[deploy] G6 WARN: referenced-but-undefined CSS classes present (see above) — non-blocking."

PASS=0; FAIL=0
for rel in "${FILES[@]}"; do
  localp="$REPO/$rel"
  srvp="$WEB/$rel"
  if [[ ! -f "$localp" ]]; then echo "  ! $rel MISSING locally"; FAIL=$((FAIL+1)); continue; fi
  bash "$SSHX" "mkdir -p '$(dirname "$srvp")'" >/dev/null 2>&1
  winp="$(cygpath -u "$localp" 2>/dev/null || echo "$localp")"
  if bash "$SSHX" put "$winp" "$srvp" >/dev/null 2>&1; then
    wintmp="$(cygpath -w "$TMPD/_$(basename "$rel")")"
    # v12.49.65-deploy: the post-upload verification `get` is rate-limited by the
    # host when 104 puts+104 gets open in a tight loop. Retry the fetch a few
    # times with a short backoff + a tiny per-file pause so the verify step
    # reflects real byte-equality instead of a throttled re-download.
    _verified=0
    for _attempt in 1 2 3; do
      if bash "$SSHX" get "$srvp" "$wintmp" >/dev/null 2>&1; then
        if diff -q <(tr -d '\r' < "$localp") <(tr -d '\r' < "$TMPD/_$(basename "$rel")") >/dev/null 2>&1; then
          _verified=1; break
        fi
      fi
      sleep 0.4
    done
    if [[ $_verified -eq 1 ]]; then
      echo "  [OK]   $rel"; PASS=$((PASS+1))
    else
      echo "  [FAIL] $rel byte-diff MISMATCH"; FAIL=$((FAIL+1))
    fi
    rm -f "$TMPD/_$(basename "$rel")"
    sleep 0.15
  else
    echo "  [FAIL] $rel scp FAILED"; FAIL=$((FAIL+1))
  fi
done

echo "Clearing OPcache (web SAPI)..."
# NOTE: CLI `php -r 'opcache_reset()'` does NOT clear the web/FPM OPcache —
# it only clears the CLI SAPI's shared memory segment. We must call
# opcache_reset() from within a web SAPI script (runs under FPM) to clear
# the cache that actually serves traffic. opcache_reset() clears the ENTIRE
# shared cache across ALL FPM workers, not just the calling one.
OPC_FILE="$WEB/_opcache_clear.php"
bash "$SSHX" "printf '%s' '<?php if (function_exists(\"opcache_reset\")) { @opcache_reset(); echo \"OPCACHE_RESET\"; } else { echo \"OPCACHE_UNAVAILABLE\"; } ?>' > '$OPC_FILE'" >/dev/null 2>&1
if curl -sS --max-time 20 "https://sr-ue-varna.com/_opcache_clear.php" 2>/dev/null | grep -q "OPCACHE_RESET"; then
  echo "  OPcache reset (web SAPI, all workers)."
  # Warmup: immediately load the new config.php into cache before stale requests repopulate it
  echo "  Warming up new config.php..."
  curl -sS --max-time 15 -X POST "https://sr-ue-varna.com/database/api.php" -H "Content-Type: application/json" -d '{"action":"getversion"}' >/dev/null 2>&1
  echo "  Warmup complete."
else
  echo "  [WARN] web OPcache reset did not confirm."
fi
bash "$SSHX" "rm -f '$OPC_FILE'" >/dev/null 2>&1

# ── EPIC-F deploy canary: post-push live smoke test ──────────────────────────
# After OPcache clears, run verify-live.cjs against the live site to assert the
# changed endpoints still serve success:true before declaring the deploy done.
echo ""
echo "Running post-deploy live smoke test (scripts/verify-live.cjs)..."
if node "$REPO_WIN/scripts/verify-live.cjs" --version="$(cat "$REPO_WIN/version.json" | python3 -c 'import sys,json;print(json.load(sys.stdin)["version"])' 2>/dev/null)"; then
  echo "  Canary PASS: live site healthy post-deploy."
else
  echo "  [WARN] Canary failed — investigate before declaring deploy successful."
fi

# ── EPIC-F canary: probe the new getmetrics endpoint ─────────────────────────
# Asserts the JSON metrics endpoint returns success:true with the expected shape.
echo ""
echo "EPIC-F canary: probing getmetrics endpoint..."
METRICS_JSON=$(curl -sS --max-time 15 -X POST "https://sr-ue-varna.com/database/api.php" -H "Content-Type: application/json" -d '{"action":"getmetrics"}' 2>/dev/null)
if echo "$METRICS_JSON" | python3 -c 'import sys,json; d=json.load(sys.stdin); assert d.get("success")==True, "success!=True"; assert "latency" in d, "latency missing"; assert "errors" in d, "errors missing"; print("  EPIC-F canary PASS: getmetrics returns success=True + latency + errors")' 2>/dev/null; then
  :
else
  echo "  [WARN] EPIC-F canary: getmetrics probe failed — investigate."
  echo "  Response: $METRICS_JSON"
fi

echo "DEPLOY SUMMARY: $PASS verified ok, $FAIL failed."
rm -rf "$TMPD"
[[ $FAIL -eq 0 ]]
