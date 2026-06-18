-- ============================================================
-- Local Link — Row Level Security policies (idempotent)
--
-- Run this in Supabase: SQL Editor → New Query → paste → Run.
-- Safe to run as many times as you want — every policy is dropped
-- and recreated. Use this if you ever see:
--   "new row violates row-level security policy for table ..."
-- It guarantees the tables have the exact policies the app expects.
-- ============================================================

-- Make sure RLS is on for every table.
ALTER TABLE profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE interest_forms         ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_submissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_subscriptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints             ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments               ENABLE ROW LEVEL SECURITY;

-- ── profiles ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can read profiles" ON profiles;
CREATE POLICY "Anyone can read profiles" ON profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users insert own profile" ON profiles;
CREATE POLICY "Users insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Users update own profile" ON profiles;
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Admin deletes profiles" ON profiles;
CREATE POLICY "Admin deletes profiles" ON profiles FOR DELETE USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

-- ── businesses ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone reads businesses" ON businesses;
CREATE POLICY "Anyone reads businesses" ON businesses FOR SELECT USING (true);
DROP POLICY IF EXISTS "Business inserts own" ON businesses;
CREATE POLICY "Business inserts own" ON businesses FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Business or admin updates" ON businesses;
CREATE POLICY "Business or admin updates" ON businesses FOR UPDATE USING (
  auth.uid() = user_id OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

-- ── topics ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone reads topics" ON topics;
CREATE POLICY "Anyone reads topics" ON topics FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin manages topics" ON topics;
CREATE POLICY "Admin manages topics" ON topics FOR ALL USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

-- ── interest_forms (leads) ──────────────────────────────────
-- THIS is the one that fixes "submit a lead violates RLS":
-- anyone (logged in or not) may submit an interest form.
DROP POLICY IF EXISTS "Anyone submits interest" ON interest_forms;
CREATE POLICY "Anyone submits interest" ON interest_forms FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Business reads own leads" ON interest_forms;
CREATE POLICY "Business reads own leads" ON interest_forms FOR SELECT USING (
  business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())
  OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);
-- Lets a logged-in customer see the interest forms they themselves submitted
-- (their "My Interest" dashboard). Matches on the JWT email claim.
DROP POLICY IF EXISTS "Customer reads own submissions" ON interest_forms;
CREATE POLICY "Customer reads own submissions" ON interest_forms FOR SELECT USING (
  customer_email = (auth.jwt() ->> 'email')
);
-- PAYMENTS LOCKDOWN: a business may NO LONGER flip `unlocked` from the browser.
-- Unlocking now happens only inside the `unlock-lead` Edge Function (service
-- role), which checks free quota / spends a prepaid credit first. Dropped, not
-- recreated.
DROP POLICY IF EXISTS "Business unlocks leads" ON interest_forms;

-- ── topic_submissions ───────────────────────────────────────
DROP POLICY IF EXISTS "Anyone submits to topic" ON topic_submissions;
CREATE POLICY "Anyone submits to topic" ON topic_submissions FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Subscribed business or admin reads" ON topic_submissions;
CREATE POLICY "Subscribed business or admin reads" ON topic_submissions FOR SELECT USING (
  topic_id IN (
    SELECT ts.topic_id FROM topic_subscriptions ts
    JOIN businesses b ON ts.business_id = b.id
    WHERE b.user_id = auth.uid() AND ts.active = 1
  )
  OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

-- ── topic_subscriptions ─────────────────────────────────────
DROP POLICY IF EXISTS "Business manages own subs" ON topic_subscriptions;
CREATE POLICY "Business manages own subs" ON topic_subscriptions FOR SELECT USING (
  business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())
);
-- PAYMENTS LOCKDOWN: subscriptions are now created only by the `stripe-webhook`
-- Edge Function (service role) after payment confirms. The browser can read its
-- own subs but can no longer insert them for free. Dropped, not recreated.
DROP POLICY IF EXISTS "Business inserts own subs" ON topic_subscriptions;

-- ── verification_requests ───────────────────────────────────
-- PAYMENTS LOCKDOWN: verification is now created/updated only by the
-- `stripe-webhook` Edge Function (service role) after the $10 fee is paid.
-- The browser keeps READ access (below) but loses INSERT/UPDATE. Dropped,
-- not recreated.
DROP POLICY IF EXISTS "Business submits verification" ON verification_requests;
DROP POLICY IF EXISTS "Business or admin reads verifications" ON verification_requests;
CREATE POLICY "Business or admin reads verifications" ON verification_requests FOR SELECT USING (
  business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())
  OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);
DROP POLICY IF EXISTS "Admin updates verifications" ON verification_requests;
CREATE POLICY "Admin updates verifications" ON verification_requests FOR UPDATE USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);
-- PAYMENTS LOCKDOWN: client-side verification UPDATE removed (see above).
DROP POLICY IF EXISTS "Business upserts verification" ON verification_requests;

-- ── complaints ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone submits complaint" ON complaints;
CREATE POLICY "Anyone submits complaint" ON complaints FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Admin manages complaints" ON complaints;
CREATE POLICY "Admin manages complaints" ON complaints FOR ALL USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

-- ── payments ────────────────────────────────────────────────
-- PAYMENTS LOCKDOWN: only the `stripe-webhook` Edge Function (service role)
-- writes payment rows, and only after Stripe confirms the charge. The browser
-- can no longer log its own payments. Dropped, not recreated.
DROP POLICY IF EXISTS "Users insert own payments" ON payments;
DROP POLICY IF EXISTS "Users or admin read payments" ON payments;
CREATE POLICY "Users or admin read payments" ON payments FOR SELECT USING (
  auth.uid() = user_id OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

-- ── businesses: protect money-bearing columns ───────────────
-- RLS is row-level, not column-level. A business legitimately needs to UPDATE
-- its own row (name, mission, price, image, category) but must NOT be able to
-- set `verified`, `verification_status`, `lead_credits`, or `free_leads_used`
-- itself. Column privileges enforce that; the Edge Functions use the service
-- role, which bypasses these REVOKEs.
REVOKE UPDATE (verified, verification_status, lead_credits, free_leads_used)
  ON businesses FROM authenticated, anon;
