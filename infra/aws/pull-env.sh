#!/bin/bash
# Run on EC2 to write apps/web/.env from SSM Parameter Store.
# EC2 must have an IAM Instance Profile with ssm:GetParameter on /aiql/prod/*
set -euo pipefail

REGION="${AWS_REGION:-ap-south-1}"
APP_ROOT="${APP_ROOT:-$HOME/aiql-erp}"
OUT="$APP_ROOT/apps/web/.env"

ssm() {
  aws ssm get-parameter --region "$REGION" --name "/aiql/prod/$1" \
    --with-decryption --query Parameter.Value --output text
}

echo ">>> Fetching secrets from SSM ($REGION)…"

cat > "$OUT" <<EOF
NODE_ENV=production

# Database
DATABASE_URL=$(ssm DATABASE_URL)

# Auth (Lucia — no NEXTAUTH_SECRET needed)
CREDENTIAL_ENCRYPTION_KEY=$(ssm CREDENTIAL_ENCRYPTION_KEY)

# Google OAuth
GOOGLE_CLIENT_ID=$(ssm GOOGLE_CLIENT_ID)
GOOGLE_CLIENT_SECRET=$(ssm GOOGLE_CLIENT_SECRET)
GOOGLE_REDIRECT_URI=$(ssm GOOGLE_REDIRECT_URI 2>/dev/null || echo "https://app.yourdomain.com/api/auth/google/callback")

# LLM
GROQ_API_KEY=$(ssm GROQ_API_KEY)
GROQ_MODEL=llama-3.3-70b-versatile
ANTHROPIC_API_KEY=$(ssm ANTHROPIC_API_KEY)
CLAUDE_MODEL=claude-haiku-4-5-20251001

# AWS (uses EC2 instance role — no static keys needed)
AWS_REGION=$REGION
AWS_S3_BUCKET=$(ssm AWS_S3_BUCKET)

# Cron auth
CRON_SECRET=$(ssm CRON_SECRET)

# Email
GMAIL_USER=$(ssm GMAIL_USER)
GMAIL_APP_PASSWORD=$(ssm GMAIL_APP_PASSWORD)

# App URL
NEXT_PUBLIC_APP_URL=$(ssm NEXT_PUBLIC_APP_URL 2>/dev/null || echo "https://app.yourdomain.com")
EOF

chmod 600 "$OUT"
echo "✅ .env written → $OUT"
