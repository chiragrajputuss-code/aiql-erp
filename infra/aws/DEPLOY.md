# AIQL ERP — AWS Deployment Runbook

Pre-revenue setup. Target: ₹0 for first 12 months (AWS Free Tier), ~₹1,800/month after.

---

## Architecture

```
Internet
    │
    ▼
Route 53 (₹0.40/hosted zone/month)
    │
    ▼
EC2 t2.micro — Ubuntu 22.04         ← FREE TIER 12 months → ~$8.50/month
  Nginx (reverse proxy + SSL)
  Next.js 14 (PM2, port 3000)
    │
    ├── RDS PostgreSQL t3.micro      ← FREE TIER 12 months → ~$12.41/month
    │   ap-south-1, 20 GB gp2
    │
    ├── S3 Standard                  ← FREE TIER 5 GB → ~$0.023/GB/month
    │   GL file uploads
    │
    ├── SSM Parameter Store          ← FREE for standard params
    │   All secrets (DB URL, API keys, etc.)
    │
    └── ACM + Let's Encrypt          ← FREE (SSL certificate)

EventBridge Scheduler               ← FREE TIER 14M invocations/month
    │ 02:30 UTC daily (8 AM IST)
    ▼
Lambda (pulse-cron)                 ← FREE TIER 1M req + 400,000 GB-s/month
    │ HTTP POST to /api/v1/cron/pulse
    ▼
EC2 Next.js app

SES (email)                         ← 62,000 free emails/month from EC2
```

**Total monthly cost:**
| Service | Free tier (12 months) | After free tier |
|---|---|---|
| EC2 t2.micro | $0 | $8.50 |
| RDS t3.micro | $0 | $12.41 |
| S3 (50 GB) | $0 | $1.15 |
| Route 53 | $0.50/zone | $0.50 |
| EventBridge + Lambda | $0 | $0 |
| SES | $0 | $0 |
| ACM / Let's Encrypt | $0 | $0 |
| **Total** | **~$0.50** | **~$22.56** |

---

## Step-by-step setup

### Prerequisites
- AWS account with free tier active
- Domain name (optional for initial setup — use EC2 public IP)
- GitHub repo (for CI/CD)

---

### Step 1 — Launch EC2

1. Open **EC2 → Launch Instance**
2. Choose **Ubuntu Server 22.04 LTS (HVM), SSD** — 64-bit
3. Instance type: **t2.micro** (Free tier eligible)
4. Key pair: Create new → download `.pem` → keep safe
5. Network settings:
   - Allow SSH (port 22) from **My IP only**
   - Allow HTTP (port 80) from **Anywhere**
   - Allow HTTPS (port 443) from **Anywhere**
6. Storage: **20 GB gp3** (free tier: 30 GB)
7. Launch

Note the **Public IPv4 address** and **Public DNS hostname**.

---

### Step 2 — Configure Security Group for RDS

RDS must allow inbound **PostgreSQL (5432)** from the EC2 security group:

1. EC2 → Security Groups → find the RDS SG
2. Inbound rules → Add rule:
   - Type: PostgreSQL
   - Source: **EC2 security group ID** (not IP — SG-to-SG reference)

---

### Step 3 — Bootstrap EC2

```bash
# Connect to EC2
ssh -i your-key.pem ubuntu@<ec2-public-ip>

# Copy and run the setup script
scp -i your-key.pem infra/aws/ec2-setup.sh ubuntu@<ec2-ip>:~/
ssh -i your-key.pem ubuntu@<ec2-ip> "bash ~/ec2-setup.sh"

# Create log directory
mkdir -p ~/logs
```

---

### Step 4 — Set up SSM Parameter Store (secrets)

Store all secrets in SSM — never put them in .env on EC2 directly (SSM is auditable, rotatable).

```bash
# Run these from your local machine (with AWS CLI configured)
REGION="ap-south-1"

# Database
aws ssm put-parameter --region $REGION --name "/aiql/prod/DATABASE_URL" \
  --value "postgresql://user:pass@<rds-endpoint>:5432/aiql_erp?sslmode=require" \
  --type "SecureString" --overwrite

# Auth
aws ssm put-parameter --region $REGION --name "/aiql/prod/NEXTAUTH_SECRET" \
  --value "$(openssl rand -hex 32)" --type "SecureString" --overwrite

aws ssm put-parameter --region $REGION --name "/aiql/prod/CREDENTIAL_ENCRYPTION_KEY" \
  --value "$(openssl rand -hex 32)" --type "SecureString" --overwrite

# Google OAuth
aws ssm put-parameter --region $REGION --name "/aiql/prod/GOOGLE_CLIENT_ID" \
  --value "YOUR_CLIENT_ID" --type "SecureString" --overwrite

aws ssm put-parameter --region $REGION --name "/aiql/prod/GOOGLE_CLIENT_SECRET" \
  --value "YOUR_CLIENT_SECRET" --type "SecureString" --overwrite

# LLM keys
aws ssm put-parameter --region $REGION --name "/aiql/prod/GROQ_API_KEY" \
  --value "gsk_..." --type "SecureString" --overwrite

aws ssm put-parameter --region $REGION --name "/aiql/prod/ANTHROPIC_API_KEY" \
  --value "sk-ant-..." --type "SecureString" --overwrite

# S3
aws ssm put-parameter --region $REGION --name "/aiql/prod/AWS_S3_BUCKET" \
  --value "aiql-uploads-prod" --type "String" --overwrite

# Cron secret (must match CRON_SECRET in Lambda env)
aws ssm put-parameter --region $REGION --name "/aiql/prod/CRON_SECRET" \
  --value "$(openssl rand -hex 32)" --type "SecureString" --overwrite

# Email
aws ssm put-parameter --region $REGION --name "/aiql/prod/GMAIL_USER" \
  --value "you@gmail.com" --type "String" --overwrite

aws ssm put-parameter --region $REGION --name "/aiql/prod/GMAIL_APP_PASSWORD" \
  --value "your-app-password" --type "SecureString" --overwrite
```

---

### Step 5 — Create `.env` on EC2 from SSM

Run this on EC2 (or in deploy script):

```bash
# infra/aws/pull-env.sh — run on EC2 to write .env from SSM
#!/bin/bash
REGION="ap-south-1"
OUT="$HOME/aiql-erp/apps/web/.env"

ssm() {
  aws ssm get-parameter --region $REGION --name "/aiql/prod/$1" \
    --with-decryption --query Parameter.Value --output text
}

cat > "$OUT" <<EOF
NODE_ENV=production
DATABASE_URL=$(ssm DATABASE_URL)
NEXTAUTH_SECRET=$(ssm NEXTAUTH_SECRET)
CREDENTIAL_ENCRYPTION_KEY=$(ssm CREDENTIAL_ENCRYPTION_KEY)
GOOGLE_CLIENT_ID=$(ssm GOOGLE_CLIENT_ID)
GOOGLE_CLIENT_SECRET=$(ssm GOOGLE_CLIENT_SECRET)
GOOGLE_REDIRECT_URI=https://app.yourdomain.com/api/auth/google/callback
GROQ_API_KEY=$(ssm GROQ_API_KEY)
ANTHROPIC_API_KEY=$(ssm ANTHROPIC_API_KEY)
CLAUDE_MODEL=claude-haiku-4-5-20251001
AWS_REGION=ap-south-1
AWS_S3_BUCKET=$(ssm AWS_S3_BUCKET)
CRON_SECRET=$(ssm CRON_SECRET)
GMAIL_USER=$(ssm GMAIL_USER)
GMAIL_APP_PASSWORD=$(ssm GMAIL_APP_PASSWORD)
NEXT_PUBLIC_APP_URL=https://app.yourdomain.com
EOF

chmod 600 "$OUT"
echo "✅ .env written to $OUT"
```

> **Note:** EC2 instance must have an **IAM Instance Profile** with `ssm:GetParameter` permission on `/aiql/prod/*`.
>
> Create via: IAM → Roles → Create role → EC2 → attach policy `AmazonSSMReadOnlyAccess` → attach to instance.

---

### Step 6 — Clone + build on EC2

```bash
# On EC2
cd ~
git clone https://github.com/YOUR_ORG/aiql-erp.git
cd aiql-erp

# Pull secrets
bash infra/aws/pull-env.sh

# Install + build
pnpm install --frozen-lockfile
pnpm --filter @aiql/db exec prisma migrate deploy
pnpm --filter web build
```

---

### Step 7 — Configure Nginx

```bash
# Copy config
sudo cp ~/aiql-erp/infra/aws/nginx.conf /etc/nginx/sites-available/aiql

# Edit domain name in the file
sudo sed -i 's/app.yourdomain.com/YOUR_ACTUAL_DOMAIN/g' /etc/nginx/sites-available/aiql

# Enable site
sudo ln -sf /etc/nginx/sites-available/aiql /etc/nginx/sites-enabled/aiql
sudo rm -f /etc/nginx/sites-enabled/default

# Test config
sudo nginx -t

# Start Nginx
sudo systemctl enable nginx && sudo systemctl start nginx
```

---

### Step 8 — SSL certificate (Let's Encrypt, free)

Your domain must already point to the EC2 IP via Route 53 / your DNS.

```bash
sudo certbot --nginx -d app.yourdomain.com
# Follow prompts — choose to redirect HTTP → HTTPS
# Certificate auto-renews via systemd timer (certbot renew)
```

---

### Step 9 — Start the app with PM2

```bash
cd ~/aiql-erp
cp infra/aws/ecosystem.config.js .
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup   # follow printed command to enable on reboot
```

Verify: `pm2 status` — should show `aiql-web` as `online`.

---

### Step 10 — Deploy pulse cron Lambda

```bash
# On your local machine (AWS CLI configured)
cd ~/aiql-erp/infra/aws/pulse-cron-lambda

CRON_SECRET="$(aws ssm get-parameter --region ap-south-1 --name /aiql/prod/CRON_SECRET \
  --with-decryption --query Parameter.Value --output text)"

APP_URL="https://app.yourdomain.com" \
CRON_SECRET="$CRON_SECRET" \
AWS_REGION="ap-south-1" \
bash deploy-lambda.sh

# Test it immediately
aws lambda invoke --function-name aiql-pulse-cron \
  --region ap-south-1 response.json && cat response.json
```

---

### Step 11 — GitHub Actions CI/CD

Add these secrets to **GitHub → Repo → Settings → Secrets → Actions**:

| Secret | Value |
|---|---|
| `EC2_HOST` | EC2 public DNS or IP |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | Contents of `.pem` file |
| `DATABASE_URL` | Your RDS connection string |
| `NEXTAUTH_SECRET` | Same as SSM value |
| `NEXT_PUBLIC_APP_URL` | `https://app.yourdomain.com` |

Every push to `main` will:
1. Type-check
2. Build Next.js
3. rsync to EC2
4. Run `prisma migrate deploy`
5. `pm2 reload` (zero-downtime)
6. Health check `/api/health`

---

## Day-2 operations

```bash
# View app logs
pm2 logs aiql-web

# Restart app
pm2 restart aiql-web

# Manual deploy without CI
cd ~/aiql-erp && git pull && pnpm install --frozen-lockfile && \
  pnpm --filter @aiql/db exec prisma migrate deploy && \
  pnpm --filter web build && pm2 reload aiql-web

# DB backfill after migration
cd ~/aiql-erp && pnpm run db:backfill-doc-types

# Check Nginx logs
sudo tail -f /var/log/nginx/aiql-error.log

# Monitor
pm2 monit
```

---

## Scaling path (when needed, not now)

1. **t2.micro → t3.small** (~$15/month) when RAM hits 80% consistently
2. **RDS t3.micro → t3.small** (~$25/month) when CPU/connections spike
3. **Add CloudFront** in front of Nginx for CDN/DDoS protection (free tier: 1 TB/month)
4. **Multi-instance**: Switch PM2 from `fork` to `cluster`, add ALB — only needed at 100+ concurrent users

---

## Cost monitoring

Enable **AWS Budgets** → Create budget → $5 alert → email notify.
Free tier: budgets are free for the first 2 alerts.

```bash
# Quick cost check
aws ce get-cost-and-usage \
  --time-period Start=$(date -v-30d +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity MONTHLY --metrics "UnblendedCost" \
  --query "ResultsByTime[*].Total.UnblendedCost"
```
