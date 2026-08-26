-- Add trial and Razorpay billing fields to organisations

ALTER TABLE "organisations"
  ADD COLUMN IF NOT EXISTS "trialEndsAt"           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "razorpayCustomerId"     TEXT,
  ADD COLUMN IF NOT EXISTS "razorpaySubscriptionId" TEXT,
  ADD COLUMN IF NOT EXISTS "subscriptionStatus"     TEXT;

-- Change default plan to FREE for new sign-ups
ALTER TABLE "organisations" ALTER COLUMN "plan" SET DEFAULT 'FREE'::"Plan";

-- Change default query limit to 100 (trial limit)
ALTER TABLE "organisations" ALTER COLUMN "queryLimit" SET DEFAULT 100;

-- Migrate existing orgs: set trialEndsAt = createdAt + 14 days if they have no subscription
UPDATE "organisations"
SET "trialEndsAt" = "createdAt" + INTERVAL '14 days'
WHERE "razorpaySubscriptionId" IS NULL
  AND "trialEndsAt" IS NULL;
