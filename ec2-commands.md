# EC2 Quick Command Reference

## Connect to EC2
```bash
ssh -i ~/.ssh/<KEY>.pem ubuntu@13.235.61.187
```

---

## PM2 — App Process

| Action | Command |
|---|---|
| Check status | `pm2 list` |
| View live logs | `pm2 logs aiql-web` |
| View last 50 lines | `pm2 logs aiql-web --lines 50` |
| Reload (zero downtime) | `pm2 reload aiql-web` |
| Restart (hard) | `pm2 restart aiql-web` |
| Stop | `pm2 stop aiql-web` |
| Start | `pm2 start infra/aws/ecosystem.config.js --env production` |
| Save process list | `pm2 save` |

---

## Nginx

| Action | Command |
|---|---|
| Check status | `sudo systemctl status nginx` |
| Reload config | `sudo nginx -t && sudo systemctl reload nginx` |
| Restart | `sudo systemctl restart nginx` |
| View error log | `sudo tail -50 /var/log/nginx/error.log` |
| View access log | `sudo tail -50 /var/log/nginx/access.log` |

---

## Database (Prisma)

```bash
cd ~/aiql-erp

# Run pending migrations (safe — never drops)
cd packages/db && ../../node_modules/.bin/prisma migrate deploy && cd ../..

# Regenerate Prisma client after schema change
cd packages/db && ../../node_modules/.bin/prisma generate && cd ../..

# Open Prisma Studio (browse DB in browser on port 5555)
cd packages/db && ../../node_modules/.bin/prisma studio
```

---

## Quick reload after manual file edit on EC2

```bash
cd ~/aiql-erp
pm2 reload aiql-web
pm2 logs aiql-web --lines 20
```

---

## Health check

```bash
curl http://localhost:3000/api/health
# Expected: {"status":"ok","db":"ok"}
```

---

## System

| Action | Command |
|---|---|
| Check memory | `free -h` |
| Check disk | `df -h` |
| Check swap | `swapon --show` |
| Check CPU | `top` |
| Check what's on port 3000 | `ss -tlnp \| grep 3000` |

---

## Full redeploy from Mac (one command)

```bash
cd "/Users/chiragrajput/AIQL ERP"
./deploy.sh 13.235.61.187 ~/.ssh/<KEY>.pem
```
