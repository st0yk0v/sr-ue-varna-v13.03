#!/usr/bin/env bash
# UEV-ERP deploy via PuTTY pscp with password auth (when key auth unavailable).
set -uo pipefail
REPO="/c/Users/999/Desktop/uev-ver-7.21"
PUBLIC_HTML="$REPO/public_html"
PSCP="/c/Program Files/PuTTY/pscp.exe"
SSH_HOST="u129919172@92.113.18.239"
SSH_PORT="65002"
SSH_PASS="Joni9966y!yyz"
TARGET="domains/sr-ue-varna.com/public_html"

echo "=== DEPLOYING public_html/ to $SSH_HOST:$SSH_PORT ==="
echo "Files to deploy: $PUBLIC_HTML (recursive)"
# Use pscp with password; -r for recursive; -P for port
"$PSCP" -P "$SSH_PORT" -pw "$SSH_PASS" -r "$PUBLIC_HTML/"* "$SSH_HOST:$TARGET/" 2>&1
echo "pscp exit=$?"
