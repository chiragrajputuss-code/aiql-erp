#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# AIQL ERP — EC2 bootstrap script
# Run once on a fresh Amazon Linux 2023 / Ubuntu 22.04 t2.micro or t3.micro
# Installs: Node 20, pnpm, PM2, Nginx, Certbot
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="/home/ubuntu/aiql-erp"
DOMAIN="${DOMAIN:-app.yourdomain.com}"   # override via: DOMAIN=xyz.com ./ec2-setup.sh

echo ">>> Updating system packages"
sudo apt-get update -y && sudo apt-get upgrade -y

echo ">>> Installing Node 20 via NodeSource"
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

echo ">>> Installing pnpm"
sudo npm install -g pnpm@10.33.0

echo ">>> Installing PM2"
sudo npm install -g pm2

echo ">>> Installing Nginx"
sudo apt-get install -y nginx

echo ">>> Installing Certbot (Let's Encrypt)"
sudo snap install --classic certbot
sudo ln -sf /snap/bin/certbot /usr/bin/certbot

echo ">>> Creating app directory"
sudo mkdir -p "$APP_DIR"
sudo chown ubuntu:ubuntu "$APP_DIR"

echo ">>> Installing AWS CLI v2"
curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
unzip -q /tmp/awscliv2.zip -d /tmp
sudo /tmp/aws/install

echo ">>> Setup complete. Next steps:"
echo "  1. Clone repo: git clone <repo-url> $APP_DIR"
echo "  2. Copy .env: scp .env ubuntu@<ec2-ip>:$APP_DIR/apps/web/.env"
echo "  3. Run: cd $APP_DIR && pnpm install --frozen-lockfile && pnpm build"
echo "  4. Configure nginx: sudo cp infra/aws/nginx.conf /etc/nginx/sites-available/aiql"
echo "  5. Request SSL: sudo certbot --nginx -d $DOMAIN"
echo "  6. Start app:  cd $APP_DIR && pm2 start infra/aws/ecosystem.config.js --env production"
echo "  7. PM2 startup: pm2 startup && pm2 save"
