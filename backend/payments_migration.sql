-- ============================================================
-- Local Link — Payments migration (Stripe + lead credits)
--
-- Run ONCE in Supabase: SQL Editor → New Query → paste → Run.
-- Idempotent: safe to re-run.
--
-- Adds:
--   • businesses.lead_credits  — prepaid balance, 1 credit = 1 paid unlock
--   • payments.stripe_session_id (UNIQUE) — makes the Stripe webhook
--     idempotent (Stripe can deliver the same event more than once;
--     the UNIQUE constraint stops us from granting a benefit twice)
--   • payments.status          — 'paid' once the webhook confirms
-- ============================================================

-- Prepaid lead-unlock balance for each business.
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS lead_credits INTEGER NOT NULL DEFAULT 0;

-- Idempotency + bookkeeping on the payments log.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS stripe_session_id TEXT,
  ADD COLUMN IF NOT EXISTS status            TEXT NOT NULL DEFAULT 'paid';

-- One Stripe Checkout Session can only ever produce one payment row.
-- This is the linchpin of webhook idempotency.
CREATE UNIQUE INDEX IF NOT EXISTS payments_stripe_session_id_key
  ON payments (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

-- Atomic credit helpers, called by the Edge Functions (service role).
-- Using SQL functions avoids read-modify-write races between two
-- near-simultaneous purchases / unlocks.

-- Add credits after a successful bundle purchase. Returns new balance.
CREATE OR REPLACE FUNCTION add_lead_credits(p_business_id BIGINT, p_amount INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE new_balance INTEGER;
BEGIN
  UPDATE businesses
     SET lead_credits = lead_credits + p_amount
   WHERE id = p_business_id
  RETURNING lead_credits INTO new_balance;
  RETURN new_balance;
END;
$$;

-- Spend exactly one credit, only if the balance is > 0.
-- Returns the new balance, or -1 if there were no credits to spend.
CREATE OR REPLACE FUNCTION spend_lead_credit(p_business_id BIGINT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE new_balance INTEGER;
BEGIN
  UPDATE businesses
     SET lead_credits = lead_credits - 1
   WHERE id = p_business_id AND lead_credits > 0
  RETURNING lead_credits INTO new_balance;
  IF NOT FOUND THEN
    RETURN -1;
  END IF;
  RETURN new_balance;
END;
$$;
