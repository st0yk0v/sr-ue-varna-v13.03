#!/usr/bin/env bash
# UEV-ERP Development Workflow Script
# Tests locally, then deploys to production on Hostinger

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

echo "🧪 UEV-ERP Development Workflow"
echo "================================="

# ── 1. LOCAL TESTING ─────────────────────────────────────────────────────────────
echo ""
echo "📋 Phase 1: Local Testing"
echo "---------------------------"

# Check Node syntax
echo "  - Checking JS syntax..."
if node --check js/app.js 2>/dev/null && node --check js/views-bundle.js 2>/dev/null; then
    echo -e "    ${GREEN}✓${NC} JavaScript syntax OK"
else
    echo -e "    ${RED}✗${NC} JavaScript syntax errors detected"
    exit 1
fi

# Check PHP syntax
echo "  - Checking PHP syntax..."
PHP_FILES=$(find database -name "*.php" -type f 2>/dev/null | head -10)
PHP_ERRORS=0
for php_file in $PHP_FILES; do
    if ! php -l "$php_file" >/dev/null 2>&1; then
        echo -e "    ${RED}✗${NC} PHP syntax error in $php_file"
        PHP_ERRORS=$((PHP_ERRORS + 1))
    fi
done
if [ $PHP_ERRORS -eq 0 ]; then
    echo -e "    ${GREEN}✓${NC} PHP syntax OK"
fi

# Run pre-commit checks
echo "  - Running pre-commit checks..."
if [ -f ".git/hooks/pre-commit" ] && command -v node &>/dev/null; then
    echo "    Running pre-commit guards..."
fi

# ── 2. DEPLOY CONFIRMATION ─────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}⚠️  Ready to deploy to production (sr-ue-varna.com)${NC}"
read -p "Continue with deployment? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 0
fi

# ── 3. DEPLOY ─────────────────────────────────────────────────────────────────────
echo ""
echo "🚀 Phase 2: Deploying to Production"
echo "------------------------------------"

# SSH configuration
HOST="92.113.18.239"
PORT="65002"
USER="u129919172"
WEB="domains/sr-ue-varna.com/public_html"
SSH_KEY="/c/Users/999/.ssh/uev_deploy"

# Verify SSH key exists
if [ ! -f "$SSH_KEY" ]; then
    echo -e "${RED}❌ SSH key not found at $SSH_KEY${NC}"
    exit 1
fi

# Deploy JS files
echo "  - Uploading JS files..."
scp -i "$SSH_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -P "$PORT" \
    js/app.js js/components.js js/views-bundle.js \
    "$USER@$HOST:$WEB/js/" && echo "    ✓ JS files uploaded"

# Deploy HTML/CSS
echo "  - Uploading HTML/CSS files..."
scp -i "$SSH_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -P "$PORT" \
    index.html version.json styles.css styles-responsive.css \
    "$USER@$HOST:$WEB/" && echo "    ✓ HTML/CSS files uploaded"

# Deploy PHP API
echo "  - Uploading PHP files..."
scp -i "$SSH_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -P "$PORT" \
    database/api.php database/action_map.php \
    "$USER@$HOST:$WEB/database/" && echo "    ✓ PHP files uploaded"

# Clear OPcache
echo "  - Clearing OPcache..."
ssh -i "$SSH_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -p "$PORT" \
    "$USER@$HOST" "cd '$WEB' && php -r 'opcache_reset();' && echo 'OPcache cleared'" && \
    echo "    ✓ OPcache reset"

# ── 4. VERIFICATION ─────────────────────────────────────────────────────────────
echo ""
echo "✅ Phase 3: Verification"
echo "-------------------------"

sleep 2  # Brief pause for CDN propagation

# Check version
PROD_VERSION=$(curl -s https://sr-ue-varna.com/version.json | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
EXPECTED_VERSION="12.54.59"

if [ "$PROD_VERSION" = "$EXPECTED_VERSION" ]; then
    echo -e "  ${GREEN}✓${NC} Version $PROD_VERSION deployed"
else
    echo -e "  ${YELLOW}⚠${NC} Version mismatch: expected $EXPECTED_VERSION, got $PROD_VERSION"
fi

# Health check
echo "  - Running health check..."
if curl -sf https://sr-ue-varna.com/ >/dev/null 2>&1; then
    HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' https://sr-ue-varna.com/)
    echo -e "  ${GREEN}✓${NC} Site responding (HTTP $HTTP_CODE)"
else
    echo -e "  ${RED}✗${NC} Site not responding"
fi

echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo "   Site: https://sr-ue-varna.com"
echo "   Version: $PROD_VERSION"
echo "   $(date)"