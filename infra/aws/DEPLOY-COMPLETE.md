# AIQL ERP — Complete EC2 t2.micro Deployment Guide

Every command is copy-paste ready. Replace values in `< >` with your actual values.
Zero prior AWS deployment experience assumed.

---

## Prerequisites checklist

- [ ] AWS account created (free tier active)
- [ ] Domain name (optional — can use EC2 IP for now)
- [ ] GitHub account + repo with this code
- [ ] Your local machine has: `aws` CLI, `ssh`, `scp`, `git`
- [ ] Google OAuth credentials (for login)
- [ ] Groq API key (free at console.groq.com)
- [ ] Gmail App Password (for pulse emails)

---

## Part A — AWS Console Setup (browser)

### A1. Create an S3 bucket for GL file uploads

1. Go to **S3** → **Create bucket**
2. Bucket name: `aiql-uploads-prod` (must be globally unique — add your name, e.g. `aiql-uploads-chirag-prod`)
3. Region: **Asia Pacific (Mumbai) ap-south-1**
4. Block all public access: ✅ **ON** (files are private, accessed via pre-signed URLs)
5. Versioning: Off
6. Click **Create bucket**

Note your bucket name.

---

### A2. Create an IAM user for S3 (for local dev + CI builds)

> The EC2 instance will use an IAM Role (not keys) — but CI and local dev need keys.

1. **IAM → Users → Create user**
2. User name: `aiql-app-user`
3. Next → **Attach policies directly**
4. Search and select:
   - `AmazonS3FullAccess`  ← for file uploads
   - `AmazonSSMReadOnlyAccess`  ← for reading secrets (optional for CI)
5. Create user → go to the user → **Security credentials** tab
6. **Create access key** → Application running outside AWS → Create
7. **Download the CSV now** — you won't see the secret again

Note: `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.

---

### A3. Create IAM Role for EC2 (no static keys on server)

1. **IAM → Roles → Create role**
2. Trusted entity: **AWS service → EC2**
3. Attach policies:
   - `AmazonSSMReadOnlyAccess`
   - `AmazonS3FullAccess`
   - `CloudWatchAgentServerPolicy` (for logs — optional)
4. Role name: `aiql-ec2-role`
5. Create role

---

### A4. Launch EC2 t2.micro

1. **EC2 → Launch instances**

2. **Name**: `aiql-erp-prod`

3. **AMI**: Ubuntu Server 22.04 LTS (HVM), SSD Volume Type
   - Search "Ubuntu 22.04" → select the one marked **Free tier eligible**

4. **Instance type**: `t2.micro` ← Free tier eligible (1 vCPU, 1 GB RAM)

5. **Key pair**: Click **Create new key pair**
   - Name: `aiql-prod-key`
   - Type: RSA
   - Format: `.pem`
   - Click **Create** → it downloads `aiql-prod-key.pem`
   - Move it somewhere safe: `mv ~/Downloads/aiql-prod-key.pem ~/.ssh/`
   - Lock it: `chmod 400 ~/.ssh/aiql-prod-key.pem`

6. **Network settings** (click Edit):
   - VPC: default
   - Subnet: any (pick first available)
   - Auto-assign public IP: **Enable**
   - Firewall: **Create security group**
     - Name: `aiql-web-sg`
     - Add rules:
       | Type | Port | Source |
       |---|---|---|
       | SSH | 22 | My IP |
       | HTTP | 80 | Anywhere (0.0.0.0/0, ::/0) |
       | HTTPS | 443 | Anywhere (0.0.0.0/0, ::/0) |

7. **Configure storage**: 20 GB gp3 (free tier gives 30 GB)

8. **Advanced details → IAM instance profile**: select `aiql-ec2-role`

9. Click **Launch instance**

10. Wait ~1 minute → go to **EC2 → Instances** → click your instance
    - Note the **Public IPv4 address** (e.g. `13.234.56.78`)
    - Note the **Public IPv4 DNS** (e.g. `ec2-13-234-56-78.ap-south-1.compute.amazonaws.com`)

---

### A5. RDS PostgreSQL — allow EC2 access

Your RDS is already running (per CLAUDE.md). You need to allow the EC2 instance to connect.

1. **RDS → Databases → your DB → Connectivity & security**
2. Note the **Endpoint** (e.g. `aiql-db.abc123.ap-south-1.rds.amazonaws.com`)
3. Click the **VPC security group** link
4. **Inbound rules → Edit inbound rules → Add rule**:
   - Type: PostgreSQL (port 5432)
   - Source: **Custom** → type the security group ID of `aiql-web-sg`
     (find it at EC2 → Security Groups → `aiql-web-sg` → copy the `sg-xxxxxxxx` ID)
5. Save rules

Test from your local machine first:
```bash
psql "postgresql://postgres:<password>@<rds-endpoint>:5432/aiql_erp?sslmode=require" -c "SELECT 1"
```

---

## Part B — First SSH + Server Setup

### B1. Connect to EC2

```bash
ssh -i ~/.ssh/aiql-prod-key.pem ubuntu@<EC2_PUBLIC_IP>
```

If you get a warning about known hosts, type `yes`.

You should see the Ubuntu welcome banner.

---

### B2. Install all software (copy the whole block)

```bash
# Update system
sudo apt-get update -y && sudo apt-get upgrade -y

# Install Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify Node version (should be 20.x)
node --version

# Install pnpm (exact version matching package.json)
sudo npm install -g pnpm@10.33.0
pnpm --version

# Install PM2 (process manager — keeps app alive after reboot)
sudo npm install -g pm2

# Install Nginx (web server / reverse proxy)
sudo apt-get install -y nginx

# Install Certbot for free SSL
sudo snap install --classic certbot
sudo ln -sf /snap/bin/certbot /usr/bin/certbot

# Install Git
sudo apt-get install -y git

# Create log directory
mkdir -p ~/logs

# Verify everything
node --version && pnpm --version && pm2 --version && nginx -v && certbot --version
```

Expected output: all version numbers printed, no errors.

---

### B3. Clone the repo

```bash
# Still on EC2 — replace with your GitHub repo URL
git clone https://github.com/<YOUR_ORG>/aiql-erp.git ~/aiql-erp
cd ~/aiql-erp
ls
# Should see: apps/ packages/ package.json pnpm-lock.yaml etc.
```

If the repo is private, you'll need to authenticate. Options:
- Add your GitHub deploy key: `ssh-keygen -t ed25519 -C "ec2-deploy"` → add public key to GitHub → Settings → Deploy keys
- Or use a GitHub Personal Access Token in the URL: `https://<TOKEN>@github.com/...`

---

### B4. Install dependencies

```bash
cd ~/aiql-erp
pnpm install --frozen-lockfile
# Takes 2-3 minutes on t2.micro — downloads all packages
```

---

## Part C — Secrets Setup

### C1. Store all secrets in SSM Parameter Store

Run these **on your local machine** (not EC2) with AWS CLI configured:

```bash
# Configure AWS CLI if not done yet
aws configure
# AWS Access Key ID: <from A2>
# AWS Secret Access Key: <from A2>
# Default region: ap-south-1
# Default output format: json

REGION="ap-south-1"

# ── Database ──────────────────────────────────────────────────────────────────
aws ssm put-parameter --region $REGION \
  --name "/aiql/prod/DATABASE_URL" \
  --value "postgresql://postgres:<DB_PASSWORD>@<RDS_ENDPOINT>:5432/aiql_erp?sslmode=require" \
  --type "SecureString" --overwrite

# ── Encryption key (generate fresh) ──────────────────────────────────────────
aws ssm put-parameter --region $REGION \
  --name "/aiql/prod/CREDENTIAL_ENCRYPTION_KEY" \
  --value "$(openssl rand -hex 32)" \
  --type "SecureString" --overwrite

# ── Google OAuth ──────────────────────────────────────────────────────────────
# Get from: console.cloud.google.com → APIs & Services → Credentials → OAuth 2.0
# Authorized redirect URI must include: https://app.yourdomain.com/api/auth/google/callback
aws ssm put-parameter --region $REGION \
  --name "/aiql/prod/GOOGLE_CLIENT_ID" \
  --value "<YOUR_GOOGLE_CLIENT_ID>" \
  --type "SecureString" --overwrite

aws ssm put-parameter --region $REGION \
  --name "/aiql/prod/GOOGLE_CLIENT_SECRET" \
  --value "<YOUR_GOOGLE_CLIENT_SECRET>" \
  --type "SecureString" --overwrite

aws ssm put-parameter --region $REGION \
  --name "/aiql/prod/GOOGLE_REDIRECT_URI" \
  --value "https://<YOUR_DOMAIN>/api/auth/google/callback" \
  --type "String" --overwrite

# ── LLM API keys ──────────────────────────────────────────────────────────────
# Groq: free at console.groq.com
aws ssm put-parameter --region $REGION \
  --name "/aiql/prod/GROQ_API_KEY" \
  --value "gsk_<YOUR_GROQ_KEY>" \
  --type "SecureString" --overwrite

# Anthropic: console.anthropic.com (Claude Haiku — cheapest)
aws ssm put-parameter --region $REGION \
  --name "/aiql/prod/ANTHROPIC_API_KEY" \
  --value "sk-ant-<YOUR_ANTHROPIC_KEY>" \
  --type "SecureString" --overwrite

# ── AWS (S3) ──────────────────────────────────────────────────────────────────
aws ssm put-parameter --region $REGION \
  --name "/aiql/prod/AWS_S3_BUCKET" \
  --value "aiql-uploads-<YOUR_SUFFIX>-prod" \
  --type "String" --overwrite

# ── Cron secret (generate fresh — must match what you set in Lambda later) ────
CRON_SECRET="$(openssl rand -hex 32)"
aws ssm put-parameter --region $REGION \
  --name "/aiql/prod/CRON_SECRET" \
  --value "$CRON_SECRET" \
  --type "SecureString" --overwrite
echo "SAVE THIS CRON_SECRET: $CRON_SECRET"

# ── Email (Gmail App Password) ────────────────────────────────────────────────
# Enable at: myaccount.google.com/apppasswords
aws ssm put-parameter --region $REGION \
  --name "/aiql/prod/GMAIL_USER" \
  --value "you@gmail.com" \
  --type "String" --overwrite

aws ssm put-parameter --region $REGION \
  --name "/aiql/prod/GMAIL_APP_PASSWORD" \
  --value "<16-char-app-password>" \
  --type "SecureString" --overwrite

# ── App URL ───────────────────────────────────────────────────────────────────
aws ssm put-parameter --region $REGION \
  --name "/aiql/prod/NEXT_PUBLIC_APP_URL" \
  --value "https://<YOUR_DOMAIN>" \
  --type "String" --overwrite

echo "✅ All secrets stored in SSM"
```

Verify: `aws ssm get-parameters-by-path --path "/aiql/prod" --region ap-south-1 --query "Parameters[*].Name"`

---

### C2. Write .env on EC2 from SSM

Back on EC2:

```bash
cd ~/aiql-erp
bash infra/aws/pull-env.sh
# Should print: ✅ .env written → /home/ubuntu/aiql-erp/apps/web/.env

# Verify (should show all keys, values hidden)
grep "^[A-Z]" apps/web/.env | cut -d= -f1
```

**Also create a `.env` at the repo root** (needed by Prisma CLI):

```bash
echo "DATABASE_URL=$(grep DATABASE_URL apps/web/.env | cut -d= -f2-)" > .env
```

---

## Part D — Database + Build

### D1. Run database migrations

```bash
cd ~/aiql-erp

# Generate Prisma client
pnpm --filter @aiql/db exec prisma generate

# Apply all 16 migrations to your RDS
pnpm --filter @aiql/db exec prisma migrate deploy

# Should print: Applied X migration(s) successfully
# Verify last migration applied:
pnpm --filter @aiql/db exec prisma migrate status
```

---

### D2. Build the Next.js app

This takes 3-5 minutes on t2.micro (1 vCPU):

```bash
cd ~/aiql-erp

# Build all packages first (query-engine, doc-parsers, pulse-engine etc.)
pnpm --filter @aiql/query-engine build
pnpm --filter @aiql/tokeniser build
pnpm --filter @aiql/schema-intel build
pnpm --filter @aiql/close-engine build
pnpm --filter @aiql/pulse-engine build
pnpm --filter @aiql/doc-parsers build
pnpm --filter @aiql/erp-connectors build

# Build the web app
pnpm --filter web build

# Should end with: ✓ Compiled successfully
# If it runs out of memory, increase Node heap:
# NODE_OPTIONS="--max-old-space-size=768" pnpm --filter web build
```

---

### D3. Test the app starts

```bash
cd ~/aiql-erp/apps/web

# Quick smoke test — Ctrl+C after confirming it starts
PORT=3000 node_modules/.bin/next start &
sleep 5
curl -s http://localhost:3000/api/health
# Expected: {"status":"ok","db":"ok"}
kill %1
```

---

## Part E — Nginx + SSL

### E1. Configure Nginx

```bash
# Copy the nginx config
sudo cp ~/aiql-erp/infra/aws/nginx.conf /etc/nginx/sites-available/aiql

# Replace the placeholder domain with your actual domain (or EC2 IP for now)
# Option A: real domain
sudo sed -i 's/app.yourdomain.com/<YOUR_DOMAIN>/g' /etc/nginx/sites-available/aiql

# Option B: no domain yet — use IP (HTTP only, no SSL)
# (edit manually: sudo nano /etc/nginx/sites-available/aiql)

# Enable the site
sudo ln -sf /etc/nginx/sites-available/aiql /etc/nginx/sites-enabled/aiql
sudo rm -f /etc/nginx/sites-enabled/default

# Test config
sudo nginx -t
# Expected: syntax is ok / test is successful

# Start Nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

### E2. Point your domain to EC2 (skip if using IP)

In your DNS provider (Route 53 or wherever your domain lives):

- Add an **A record**: `app.yourdomain.com` → `<EC2_PUBLIC_IP>`
- TTL: 300 (5 minutes)
- Wait 5 minutes for propagation

Verify: `dig app.yourdomain.com` → should show your EC2 IP.

---

### E3. Free SSL certificate with Let's Encrypt

```bash
# Get SSL cert (replaces the self-signed placeholders in nginx.conf)
sudo certbot --nginx -d <YOUR_DOMAIN>

# Follow prompts:
# Enter email → Y for terms → N for marketing
# Choose: redirect HTTP to HTTPS (option 2) ← recommended

# Certbot auto-renews every 90 days via systemd timer
# Verify auto-renew:
sudo systemctl status snap.certbot.renew.timer
```

---

### E4. For IP-only (no domain) — HTTP only config

If you don't have a domain yet, use this simplified nginx config:

```bash
sudo tee /etc/nginx/sites-available/aiql > /dev/null <<'EOF'
server {
    listen 80;
    client_max_body_size 100M;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
EOF
sudo nginx -t && sudo systemctl reload nginx
```

Access at `http://<EC2_PUBLIC_IP>`. Add SSL later when domain is ready.

---

## Part F — Start App with PM2

### F1. Copy PM2 config + start

```bash
cd ~/aiql-erp

# Copy ecosystem config to repo root (PM2 expects it here)
cp infra/aws/ecosystem.config.js .

# Start the app
pm2 start ecosystem.config.js --env production

# Check it's running
pm2 status
# Should show: aiql-web   online
```

---

### F2. Enable PM2 on reboot

```bash
# Generate startup command
pm2 startup

# PM2 will print a command like:
# sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ubuntu --hp /home/ubuntu
# COPY AND RUN THAT EXACT COMMAND, then:

pm2 save
# Saves current process list — will restart on reboot
```

---

### F3. Verify everything works

```bash
# Check app health
curl -s http://localhost:3000/api/health
# {"status":"ok","db":"ok"}

# Check via Nginx (HTTP)
curl -s http://<EC2_PUBLIC_IP>/api/health

# Check via HTTPS (if domain + SSL done)
curl -s https://<YOUR_DOMAIN>/api/health

# View live logs
pm2 logs aiql-web --lines 50

# View PM2 dashboard
pm2 monit
# (Ctrl+C to exit)
```

Open `https://<YOUR_DOMAIN>` in browser — should see the AIQL login page.

---

## Part G — Cron Job (Pulse Daily Email)

This replaces the Vercel cron. Uses Lambda (free tier) + EventBridge Scheduler.

### G1. Deploy the Lambda

On your **local machine**:

```bash
cd ~/aiql-erp/infra/aws/pulse-cron-lambda

# Get the cron secret we stored earlier
CRON_SECRET=$(aws ssm get-parameter \
  --region ap-south-1 \
  --name "/aiql/prod/CRON_SECRET" \
  --with-decryption \
  --query Parameter.Value \
  --output text)

# Deploy
APP_URL="https://<YOUR_DOMAIN>" \
CRON_SECRET="$CRON_SECRET" \
AWS_REGION="ap-south-1" \
bash deploy-lambda.sh
```

---

### G2. Test the Lambda

```bash
# Invoke it manually
aws lambda invoke \
  --function-name aiql-pulse-cron \
  --region ap-south-1 \
  --payload '{}' \
  response.json

cat response.json
# Should show: {"statusCode":200,...}
```

The Lambda runs automatically every day at 02:30 UTC (8:00 AM IST).

---

## Part H — CI/CD with GitHub Actions

### H1. Add GitHub repository secrets

Go to: **GitHub → your repo → Settings → Secrets and variables → Actions → New repository secret**

Add each:

| Secret name | Value |
|---|---|
| `EC2_HOST` | your EC2 public IP or DNS |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | full contents of `aiql-prod-key.pem` (including `-----BEGIN...` lines) |
| `DATABASE_URL` | your RDS connection string |
| `NEXT_PUBLIC_APP_URL` | `https://<YOUR_DOMAIN>` |

---

### H2. Push to main → auto-deploys

```bash
# On your local machine
git add .
git commit -m "deploy: add AWS infrastructure"
git push origin main
```

Go to **GitHub → Actions** tab — watch the deploy workflow run.

Every future push to `main` will:
1. Install deps + typecheck
2. Build Next.js
3. rsync changed files to EC2
4. Run `prisma migrate deploy` (safe, never drops data)
5. `pm2 reload` (zero-downtime — app stays up during reload)
6. Hit `/api/health` to confirm success

---

## Part I — Google OAuth setup (login)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create project or use existing → **APIs & Services → Credentials**
3. **Create credentials → OAuth client ID**
   - Application type: Web application
   - Name: AIQL ERP
   - Authorized JavaScript origins: `https://<YOUR_DOMAIN>`
   - Authorized redirect URIs: `https://<YOUR_DOMAIN>/api/auth/google/callback`
4. Copy **Client ID** and **Client Secret** → update SSM:

```bash
aws ssm put-parameter --region ap-south-1 \
  --name "/aiql/prod/GOOGLE_CLIENT_ID" \
  --value "<CLIENT_ID>" --type "SecureString" --overwrite

aws ssm put-parameter --region ap-south-1 \
  --name "/aiql/prod/GOOGLE_CLIENT_SECRET" \
  --value "<CLIENT_SECRET>" --type "SecureString" --overwrite
```

5. Re-pull env on EC2 + reload:

```bash
ssh -i ~/.ssh/aiql-prod-key.pem ubuntu@<EC2_IP>
cd ~/aiql-erp && bash infra/aws/pull-env.sh && pm2 reload aiql-web
```

---

## Part J — Verify everything end-to-end

Run this checklist after all steps:

```bash
# On EC2
echo "=== App process ===" && pm2 status
echo "=== Health check ===" && curl -s http://localhost:3000/api/health
echo "=== Nginx ===" && sudo systemctl status nginx | grep Active
echo "=== SSL ===" && sudo certbot certificates
echo "=== DB migrations ===" && cd ~/aiql-erp && pnpm --filter @aiql/db exec prisma migrate status
echo "=== Disk ===" && df -h /
echo "=== Memory ===" && free -m
```

Expected:
- PM2: `aiql-web  online`
- Health: `{"status":"ok","db":"ok"}`
- Nginx: `active (running)`
- SSL: `Expiry Date: ...` (90 days out)
- Migrations: `All migrations have been applied`
- Disk: < 15 GB used (free tier gives 20 GB)
- Memory: < 800 MB used

---

## Troubleshooting

**App won't start / out of memory during build:**
```bash
# Increase Node heap size for build only
NODE_OPTIONS="--max-old-space-size=768" pnpm --filter web build
```

**PM2 shows `errored` status:**
```bash
pm2 logs aiql-web --err --lines 100
# Common cause: wrong DATABASE_URL or missing env var
# Fix: bash infra/aws/pull-env.sh && pm2 reload aiql-web
```

**Cannot connect to RDS:**
```bash
# Test from EC2
psql "$DATABASE_URL" -c "SELECT NOW()"
# If fails: check RDS security group inbound rule (Step A5)
# Ensure sslmode=require in connection string
```

**Nginx 502 Bad Gateway:**
```bash
# App not running
pm2 status
pm2 restart aiql-web
sudo tail -20 /var/log/nginx/aiql-error.log
```

**SSL certificate error:**
```bash
sudo certbot renew --dry-run     # test renewal
sudo certbot certificates        # check expiry
```

**pnpm out of disk space during install:**
```bash
# Clean pnpm cache
pnpm store prune
df -h /   # check available
```

---

## Day-2 operations

```bash
# Deploy latest code manually
cd ~/aiql-erp
git pull
pnpm install --frozen-lockfile
pnpm --filter web build
pnpm --filter @aiql/db exec prisma migrate deploy
pm2 reload aiql-web

# View logs
pm2 logs aiql-web
sudo tail -f /var/log/nginx/aiql-error.log

# Restart app (hard restart, brief downtime)
pm2 restart aiql-web

# Reload app (zero-downtime)
pm2 reload aiql-web

# SSH tunnel for DB inspection (Prisma Studio from local machine)
ssh -i ~/.ssh/aiql-prod-key.pem -L 5555:localhost:3000 ubuntu@<EC2_IP>
# Then open http://localhost:5555 to see the app through the tunnel

# Update a secret
aws ssm put-parameter --region ap-south-1 --name "/aiql/prod/GROQ_API_KEY" \
  --value "gsk_new_key" --type "SecureString" --overwrite
ssh ubuntu@<EC2_IP> "cd ~/aiql-erp && bash infra/aws/pull-env.sh && pm2 reload aiql-web"
```

---

## Cost control

**Set a billing alarm (free):**
1. AWS Console → **Billing → Budgets → Create budget**
2. Budget type: Cost
3. Amount: $5
4. Alert: when actual cost > 80% of budget
5. Email: your email

**Free tier usage tracker:**
- AWS Console → **Billing → Free tier** — shows usage vs limits in real-time

**Services used and free tier limits:**

| Service | Free tier limit | After limit |
|---|---|---|
| EC2 t2.micro | 750 hours/month (12 months) | $0.0116/hour |
| RDS t3.micro | 750 hours/month (12 months) | $0.017/hour |
| S3 storage | 5 GB (12 months) | $0.023/GB |
| S3 requests | 20K GET, 2K PUT (12 months) | $0.004/10K |
| Lambda | 1M req + 400K GB-s (forever) | $0 for this use |
| EventBridge | 14M events/month (forever) | $0 for this use |
| Data transfer | 100 GB out/month (12 months) | $0.085/GB |
| SES via EC2 | 62,000 emails/month (forever) | $0 for this use |
