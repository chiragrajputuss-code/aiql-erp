#!/usr/bin/env bash
# Manual deploy to EC2 — the laptop fallback for when GitHub Actions can't
# reach the server (its SSH step has failed on every run since Aug 2026;
# the security group only admits this machine's IP).
#
# Mirrors .github/workflows/deploy.yml step for step, with one deliberate
# difference: the source rsync EXCLUDES .env files. The workflow syncs a
# GitHub checkout (which has no .env), but this machine's checkout does —
# and silently replacing the server's runtime config with laptop config is
# how a working production site dies at 11pm.
#
# Usage:  bash scripts/deploy-manual.sh
set -euo pipefail

HOST="13.235.61.187"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:/opt/homebrew/bin:$PATH"

step() { printf "\n\033[1;36m── %s\033[0m\n" "$*"; }

step "0/6  Preflight"
cd "$REPO_DIR"
if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is dirty — deploy ships whatever is on disk, not the commit."
  echo "Commit or stash first."; exit 1
fi
echo "deploying commit: $(git log -1 --format='%h %s')"

# Find a key + user that the server accepts.
KEY=""; EC2_USER=""
for k in "$HOME"/.ssh/*.pem "$HOME"/.ssh/id_*; do
  [ -f "$k" ] || continue
  for u in ubuntu ec2-user; do
    if ssh -i "$k" -o BatchMode=yes -o ConnectTimeout=6 -o StrictHostKeyChecking=accept-new \
        "$u@$HOST" true 2>/dev/null; then
      KEY="$k"; EC2_USER="$u"; break 2
    fi
  done
done
if [ -z "$KEY" ]; then
  echo "No key in ~/.ssh gets into $HOST as ubuntu or ec2-user."
  echo "Find the .pem you used for the September deploys and put it in ~/.ssh/."
  exit 1
fi
echo "connected with: $KEY as $EC2_USER"
SSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new"

step "1/6  Build"
if [ ! -d apps/web/.next ]; then
  pnpm --filter web build
else
  echo "using existing apps/web/.next ($(find apps/web/.next -name BUILD_ID -exec cat {} \; 2>/dev/null))"
  echo "(delete apps/web/.next to force a rebuild)"
fi

step "2/6  Upload built app"
rsync -az --delete -e "$SSH" \
  --exclude='.next/cache' \
  apps/web/.next \
  "$EC2_USER@$HOST:~/aiql-erp/apps/web/"

step "3/6  Upload source (server config protected)"
rsync -az --delete -e "$SSH" \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.git' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='.claude' \
  . \
  "$EC2_USER@$HOST:~/aiql-erp/"

step "4/6  Install deps, migrate, reload"
$SSH "$EC2_USER@$HOST" "
  set -e
  cd ~/aiql-erp
  export PATH=\$HOME/.local/share/pnpm:\$HOME/.nvm/versions/node/*/bin:\$PATH
  pnpm install --frozen-lockfile --prod 2>/dev/null || pnpm install --frozen-lockfile
  pnpm --filter @aiql/db exec prisma migrate deploy
  pm2 reload ecosystem.config.js --env production --update-env || pm2 start ecosystem.config.js --env production
  pm2 save
"

step "5/6  Health check"
sleep 8
status=$(curl -s -o /dev/null -w "%{http_code}" "https://acctqai.com/api/health" || echo 000)
if [ "$status" != "200" ]; then
  echo "❌ Health check failed: HTTP $status — check:  $SSH $EC2_USER@$HOST 'pm2 logs --lines 50'"
  exit 1
fi
echo "✅ health: HTTP 200"

step "6/6  Verify the new build is actually serving"
local_id=$(cat apps/web/.next/BUILD_ID)
live_chunk=$(curl -s https://acctqai.com/login | grep -o '/_next/static/chunks/webpack-[^"]*\.js' | head -1)
live_date=$(curl -sI "https://acctqai.com$live_chunk" | grep -i last-modified || true)
echo "local BUILD_ID : $local_id"
echo "live chunk     : $live_chunk"
echo "live chunk date: ${live_date#*: }"
echo
echo "Done. Log in → Settings → General — the 'Client report branding' card"
echo "should be there. Set the firm name before sending any outreach."
