#!/bin/bash
# ─── AccountIQ — Local Deploy Script ─────────────────────────────────────────
# Usage: ./deploy.sh <EC2_IP> <PEM_FILE>
# Example: ./deploy.sh 13.235.61.187 ~/.ssh/my-key.pem

set -e

EC2_IP="${1}"
PEM_FILE="${2}"
EC2_USER="ubuntu"
EC2_DIR="~/aiql-erp"

# ─── Validate args ────────────────────────────────────────────────────────────
if [[ -z "$EC2_IP" || -z "$PEM_FILE" ]]; then
  echo ""
  echo "Usage: ./deploy.sh <EC2_IP> <PEM_FILE>"
  echo "Example: ./deploy.sh 13.235.61.187 ~/.ssh/my-key.pem"
  echo ""
  exit 1
fi

if [[ ! -f "$PEM_FILE" ]]; then
  echo "❌ PEM file not found: $PEM_FILE"
  exit 1
fi

chmod 600 "$PEM_FILE"

SSH="ssh -i $PEM_FILE -o StrictHostKeyChecking=no $EC2_USER@$EC2_IP"
RSYNC="rsync -az --delete -e 'ssh -i $PEM_FILE -o StrictHostKeyChecking=no'"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║         AccountIQ — Deploying to EC2            ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  EC2 IP  : $EC2_IP"
echo "║  PEM     : $PEM_FILE"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ─── Step 1: Build locally ────────────────────────────────────────────────────
echo "▶ Step 1/4 — Building Next.js app locally..."
pnpm --filter web build
echo "✅ Build complete"
echo ""

# ─── Step 2: Rsync .next (built output) ──────────────────────────────────────
echo "▶ Step 2/4 — Uploading build to EC2..."
rsync -az --delete \
  --exclude='.next/cache' \
  -e "ssh -i $PEM_FILE -o StrictHostKeyChecking=no" \
  apps/web/.next \
  $EC2_USER@$EC2_IP:$EC2_DIR/apps/web/
echo "✅ Build uploaded"
echo ""

# ─── Step 3: Rsync source (for prisma, configs, packages) ────────────────────
echo "▶ Step 3/4 — Uploading source files..."
rsync -az --delete \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.git' \
  --exclude='*.log' \
  -e "ssh -i $PEM_FILE -o StrictHostKeyChecking=no" \
  . \
  $EC2_USER@$EC2_IP:$EC2_DIR/
echo "✅ Source uploaded"
echo ""

# ─── Step 4: Install deps + migrate + reload on EC2 ─────────────────────────
echo "▶ Step 4/4 — Installing deps, migrating DB, reloading PM2..."
$SSH << ENDSSH
  set -e
  cd /home/ubuntu/aiql-erp

  echo "  → Installing production dependencies..."
  CI=true pnpm install --frozen-lockfile --prod 2>/dev/null || CI=true pnpm install --frozen-lockfile

  echo "  → Loading environment..."
  set -a && source /home/ubuntu/aiql-erp/apps/web/.env && set +a

  PRISMA=/home/ubuntu/aiql-erp/node_modules/.pnpm/node_modules/.bin/prisma
  SCHEMA=/home/ubuntu/aiql-erp/packages/db/prisma/schema.prisma

  echo "  → Regenerating Prisma client..."
  "\$PRISMA" generate --schema="\$SCHEMA"

  echo "  → Running DB migrations..."
  "\$PRISMA" migrate deploy --schema="\$SCHEMA"

  echo "  → Reloading PM2..."
  pm2 reload /home/ubuntu/aiql-erp/infra/aws/ecosystem.config.js --env production --update-env 2>/dev/null || \
  pm2 start /home/ubuntu/aiql-erp/infra/aws/ecosystem.config.js --env production
  pm2 save

  echo "  → PM2 status:"
  pm2 list
ENDSSH

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║           ✅ Deploy complete!                    ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  App: http://$EC2_IP"
echo "║  Health: http://$EC2_IP/api/health"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ─── Health check ─────────────────────────────────────────────────────────────
echo "Checking health..."
sleep 5
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://$EC2_IP/api/health" || echo "000")
if [[ "$STATUS" == "200" ]]; then
  echo "✅ Health check passed (HTTP $STATUS)"
else
  echo "⚠️  Health check returned HTTP $STATUS — check PM2 logs:"
  echo "   ssh -i $PEM_FILE $EC2_USER@$EC2_IP 'pm2 logs aiql-web --lines 30'"
fi
echo ""
