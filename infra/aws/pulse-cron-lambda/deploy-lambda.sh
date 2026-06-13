#!/bin/bash
# Deploy / update the pulse cron Lambda + EventBridge Scheduler
# Prerequisites: aws cli configured, correct region set
# Run once: bash infra/aws/pulse-cron-lambda/deploy-lambda.sh

set -euo pipefail

REGION="${AWS_REGION:-ap-south-1}"
FUNCTION_NAME="aiql-pulse-cron"
ROLE_NAME="aiql-lambda-role"
SCHEDULE_NAME="aiql-pulse-daily"
APP_URL="${APP_URL:?Set APP_URL=https://app.yourdomain.com}"
CRON_SECRET="${CRON_SECRET:?Set CRON_SECRET=your-secret}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo ">>> Region: $REGION   Account: $ACCOUNT_ID"

# ── 1. IAM role for Lambda ────────────────────────────────────────────────────
ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query Role.Arn --output text 2>/dev/null || echo "")

if [[ -z "$ROLE_ARN" ]]; then
  echo ">>> Creating IAM role $ROLE_NAME"
  ROLE_ARN=$(aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
    --query Role.Arn --output text)
  aws iam attach-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  echo ">>> Waiting for role to propagate…"
  sleep 10
fi
echo "Role ARN: $ROLE_ARN"

# ── 2. Zip the function ───────────────────────────────────────────────────────
cd "$(dirname "$0")"
zip -j function.zip index.mjs
echo ">>> Zipped function.zip"

# ── 3. Create or update Lambda function ──────────────────────────────────────
FUNC_ARN=$(aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" \
  --query Configuration.FunctionArn --output text 2>/dev/null || echo "")

if [[ -z "$FUNC_ARN" || "$FUNC_ARN" == "None" ]]; then
  echo ">>> Creating Lambda function $FUNCTION_NAME"
  FUNC_ARN=$(aws lambda create-function \
    --region "$REGION" \
    --function-name "$FUNCTION_NAME" \
    --runtime "nodejs20.x" \
    --role "$ROLE_ARN" \
    --handler "index.handler" \
    --zip-file "fileb://function.zip" \
    --timeout 30 \
    --memory-size 128 \
    --environment "Variables={APP_URL=$APP_URL,CRON_SECRET=$CRON_SECRET}" \
    --query FunctionArn --output text)
else
  echo ">>> Updating Lambda function code"
  aws lambda update-function-code \
    --region "$REGION" \
    --function-name "$FUNCTION_NAME" \
    --zip-file "fileb://function.zip" > /dev/null
  aws lambda update-function-configuration \
    --region "$REGION" \
    --function-name "$FUNCTION_NAME" \
    --environment "Variables={APP_URL=$APP_URL,CRON_SECRET=$CRON_SECRET}" > /dev/null
fi
echo "Function ARN: $FUNC_ARN"

# ── 4. EventBridge Scheduler (replaces Vercel cron "30 2 * * *") ─────────────
SCHEDULER_ROLE_NAME="aiql-scheduler-role"
SCHEDULER_ROLE_ARN=$(aws iam get-role --role-name "$SCHEDULER_ROLE_NAME" \
  --query Role.Arn --output text 2>/dev/null || echo "")

if [[ -z "$SCHEDULER_ROLE_ARN" ]]; then
  echo ">>> Creating EventBridge Scheduler role"
  SCHEDULER_ROLE_ARN=$(aws iam create-role \
    --role-name "$SCHEDULER_ROLE_NAME" \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"scheduler.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
    --query Role.Arn --output text)
  aws iam put-role-policy \
    --role-name "$SCHEDULER_ROLE_NAME" \
    --policy-name "InvokeLambda" \
    --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"lambda:InvokeFunction\",\"Resource\":\"$FUNC_ARN\"}]}"
  sleep 5
fi

# Create or update the schedule — 02:30 UTC = 08:00 AM IST
EXISTING=$(aws scheduler get-schedule --name "$SCHEDULE_NAME" --region "$REGION" 2>/dev/null | head -1 || echo "")
if [[ -z "$EXISTING" ]]; then
  echo ">>> Creating EventBridge schedule $SCHEDULE_NAME"
  aws scheduler create-schedule \
    --region "$REGION" \
    --name "$SCHEDULE_NAME" \
    --schedule-expression "cron(30 2 * * ? *)" \
    --schedule-expression-timezone "UTC" \
    --flexible-time-window '{"Mode":"OFF"}' \
    --target "{\"Arn\":\"$FUNC_ARN\",\"RoleArn\":\"$SCHEDULER_ROLE_ARN\",\"Input\":\"{}\"}" \
    --state "ENABLED" > /dev/null
else
  echo ">>> Schedule $SCHEDULE_NAME already exists — skipping"
fi

echo ""
echo "✅ Pulse cron Lambda deployed successfully"
echo "   Schedule: daily at 02:30 UTC (08:00 AM IST)"
echo "   Function: $FUNC_ARN"
echo "   To test now: aws lambda invoke --function-name $FUNCTION_NAME response.json --region $REGION && cat response.json"
cd - > /dev/null
