#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# UEV-ERP → Hostinger  redeploy-hostinger.sh  (THIN WRAPPER)
#
# All real deployment logic now lives in scripts/deploy.sh. This wrapper simply
# forwards to it with --push so existing call-sites keep working.
#   e.g.  SSH_PASS=... bash scripts/redeploy-hostinger.sh
#
# Required env: SSH_PASS (the SSH password, supplied by the parent).
# ─────────────────────────────────────────────────────────────────────────────
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$DIR/deploy.sh" --push "$@"
