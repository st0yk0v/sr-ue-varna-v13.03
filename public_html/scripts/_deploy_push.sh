#!/usr/bin/env bash
# Launcher: read SSH_PASS from the canonical sshx.sh (already on disk, never echoed),
# then run the repo deploy.sh --push.
set -uo pipefail
SSHX="/c/Users/999/Desktop/TESTHERMEST/scripts/sshx.sh"
SSH_PASS="$(grep -m1 '^PW=' "$SSHX" | sed "s/^PW='//; s/'$//")"
export SSH_PASS
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec bash scripts/deploy.sh --push
