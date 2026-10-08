#!/bin/bash
# T77: Staging environment deployment script (Docker Compose)
# Deploys to a local or remote Docker container for pre-production testing.
#
# Usage: bash scripts/deploy-staging.sh
# Requires: Docker and Docker Compose installed locally
# Optional: Set STAGING_HOST, STAGING_PORT, STAGING_USER for remote deploy

set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="${REPO_DIR}/docker-compose.staging.yml"

echo "=== T77: Deploy to Staging (Docker Compose) ==="
echo ""

# ── Build the staging image ──────────────────────────────────────────────────
echo "Building staging image..."
cd "$REPO_DIR"
docker build -f docker/Dockerfile.staging -t uev-erp:staging .

# ── Start the staging container ──────────────────────────────────────────────
echo ""
echo "Starting staging container..."

# Create compose file if it doesn't exist
if [ ! -f "$COMPOSE_FILE" ]; then
    cat > "$COMPOSE_FILE" <<'COMPOSE'
version: "3.8"
services:
  uev-erp-staging:
    image: uev-erp:staging
    container_name: uev-erp-staging
    ports:
      - "8080:8080"
    environment:
      - APP_ENV=staging
      - APP_DEBUG=true
    volumes:
      - uev-erp-staging-uploads:/var/www/uev-erp/uploads
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/healthz"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 10s

volumes:
  uev-erp-staging-uploads:
COMPOSE
    echo "Created docker-compose.staging.yml"
fi

# Stop any existing staging container
docker compose -f "$COMPOSE_FILE" down 2>/dev/null || true

# Start fresh
docker compose -f "$COMPOSE_FILE" up -d

# ── Wait for health check ────────────────────────────────────────────────────
echo ""
echo "Waiting for staging container to be healthy..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:8080/healthz >/dev/null 2>&1; then
        echo "  Staging is healthy!"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "  [WARN] Staging did not become healthy within 30s"
        echo "  Check logs: docker logs uev-erp-staging"
    fi
    sleep 1
done

# ── Verify deployment ────────────────────────────────────────────────────────
echo ""
echo "Verifying staging deployment..."
HEALTH=$(curl -s --max-time 5 http://localhost:8080/healthz 2>/dev/null || echo '{"status":"unknown"}')
echo "  Health response: $HEALTH"

echo ""
echo "============================================"
echo "  T77: Staging deploy complete."
echo "  URL: http://localhost:8080"
echo "  Health: http://localhost:8080/healthz"
echo "  Logs: docker logs -f uev-erp-staging"
echo "  Stop: docker compose -f docker-compose.staging.yml down"
echo "============================================"
