-- CreateEnum
CREATE TYPE "feast_pass_plan" AS ENUM ('MONTHLY', 'ANNUAL');
CREATE TYPE "feast_pass_status" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateTable feast_pass_subscriptions
CREATE TABLE "feast_pass_subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "stripe_subscription_id" VARCHAR(255) NOT NULL,
    "stripe_customer_id" VARCHAR(255) NOT NULL,
    "plan" "feast_pass_plan" NOT NULL,
    "status" "feast_pass_status" NOT NULL,
    "current_period_start" TIMESTAMPTZ NOT NULL,
    "current_period_end" TIMESTAMPTZ NOT NULL,
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "cancelled_at" TIMESTAMPTZ,

    CONSTRAINT "feast_pass_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "feast_pass_subscriptions_user_id_key" ON "feast_pass_subscriptions"("user_id");
CREATE UNIQUE INDEX "feast_pass_subscriptions_stripe_subscription_id_key" ON "feast_pass_subscriptions"("stripe_subscription_id");
CREATE INDEX "feast_pass_subscriptions_status_current_period_end_idx" ON "feast_pass_subscriptions"("status", "current_period_end");

ALTER TABLE "feast_pass_subscriptions"
    ADD CONSTRAINT "feast_pass_subscriptions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable feast_pass_savings
CREATE TABLE "feast_pass_savings" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "saved_pence" INTEGER NOT NULL,
    "saved_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "feast_pass_savings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "feast_pass_savings_order_id_key" ON "feast_pass_savings"("order_id");
CREATE INDEX "feast_pass_savings_user_id_saved_at_idx" ON "feast_pass_savings"("user_id", "saved_at");

ALTER TABLE "feast_pass_savings"
    ADD CONSTRAINT "feast_pass_savings_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "feast_pass_savings"
    ADD CONSTRAINT "feast_pass_savings_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS
ALTER TABLE "feast_pass_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feast_pass_savings" ENABLE ROW LEVEL SECURITY;
