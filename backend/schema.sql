-- ============================================================
-- Run this in Supabase: SQL Editor → New Query → paste → Run
-- ============================================================

-- Profiles table (replaces users — auth is handled by Supabase)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK(role IN ('customer','business','admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS businesses (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  mission TEXT,
  price TEXT,
  image_url TEXT,
  category TEXT,
  verified INTEGER DEFAULT 0,
  verification_status TEXT DEFAULT 'unverified' CHECK(verification_status IN ('unverified','pending','approved','rejected')),
  free_leads_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS topics (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'category',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interest_forms (
  id BIGSERIAL PRIMARY KEY,
  business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  message TEXT,
  unlocked INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS topic_submissions (
  id BIGSERIAL PRIMARY KEY,
  topic_id BIGINT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS topic_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  topic_id BIGINT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL CHECK(plan_type IN ('single','bundle')),
  active INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS verification_requests (
  id BIGSERIAL PRIMARY KEY,
  business_id BIGINT UNIQUE NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  payment_confirmed INTEGER DEFAULT 0,
  notes TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS complaints (
  id BIGSERIAL PRIMARY KEY,
  customer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  business_id BIGINT REFERENCES businesses(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'open' CHECK(status IN ('open','reviewing','resolved')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  type TEXT NOT NULL,
  reference_id BIGINT,
  stripe_payment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Row Level Security
-- ============================================================

-- Admin check. Reads `profiles.role`, NOT the JWT's user_metadata — users can
-- write their own user_metadata, so trusting it would let anyone self-promote
-- to admin. `profiles.role` is protected by the REVOKE at the bottom of this
-- file (and of backend/rls_policies.sql).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE interest_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "Anyone can read profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Admin deletes profiles" ON profiles FOR DELETE USING (
  public.is_admin()
);

-- businesses
CREATE POLICY "Anyone reads businesses" ON businesses FOR SELECT USING (true);
CREATE POLICY "Business inserts own" ON businesses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Business or admin updates" ON businesses FOR UPDATE USING (
  auth.uid() = user_id OR public.is_admin()
);

-- topics
CREATE POLICY "Anyone reads topics" ON topics FOR SELECT USING (true);
CREATE POLICY "Admin manages topics" ON topics FOR ALL USING (
  public.is_admin()
);

-- interest_forms
CREATE POLICY "Anyone submits interest" ON interest_forms FOR INSERT WITH CHECK (true);
CREATE POLICY "Business reads own leads" ON interest_forms FOR SELECT USING (
  business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())
  OR public.is_admin()
);
CREATE POLICY "Business unlocks leads" ON interest_forms FOR UPDATE USING (
  business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())
);

-- topic_submissions
CREATE POLICY "Anyone submits to topic" ON topic_submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "Subscribed business or admin reads" ON topic_submissions FOR SELECT USING (
  topic_id IN (
    SELECT ts.topic_id FROM topic_subscriptions ts
    JOIN businesses b ON ts.business_id = b.id
    WHERE b.user_id = auth.uid() AND ts.active = 1
  )
  OR public.is_admin()
);

-- topic_subscriptions
CREATE POLICY "Business manages own subs" ON topic_subscriptions FOR SELECT USING (
  business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())
);
CREATE POLICY "Business inserts own subs" ON topic_subscriptions FOR INSERT WITH CHECK (
  business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())
);

-- verification_requests
CREATE POLICY "Business submits verification" ON verification_requests FOR INSERT WITH CHECK (
  business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())
);
CREATE POLICY "Business or admin reads verifications" ON verification_requests FOR SELECT USING (
  business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())
  OR public.is_admin()
);
CREATE POLICY "Admin updates verifications" ON verification_requests FOR UPDATE USING (
  public.is_admin()
);
CREATE POLICY "Business upserts verification" ON verification_requests FOR UPDATE USING (
  business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())
);

-- complaints
CREATE POLICY "Anyone submits complaint" ON complaints FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin manages complaints" ON complaints FOR ALL USING (
  public.is_admin()
);

-- payments
CREATE POLICY "Users insert own payments" ON payments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users or admin read payments" ON payments FOR SELECT USING (
  auth.uid() = user_id OR public.is_admin()
);

-- ============================================================
-- Column-level lockdown (row policies can't express this)
-- ============================================================
-- A business owns its row but must not set its own badge / balances, and a
-- user owns their profile but must not set their own role.
REVOKE UPDATE (verified, verification_status, free_leads_used)
  ON businesses FROM authenticated, anon;
REVOKE UPDATE (role, id, email) ON profiles FROM authenticated, anon;

-- ============================================================
-- Seed default topics (run once after creating tables)
-- ============================================================
INSERT INTO topics (name, description, icon) VALUES
  ('Tutoring & Education', 'Academic support and subject tutoring', 'school'),
  ('Tech & Software', 'App development, web design, and tech services', 'computer'),
  ('Lawn & Garden', 'Landscaping, mowing, and outdoor services', 'yard'),
  ('Creative & Design', 'Graphic design, art, and creative services', 'palette'),
  ('Food & Catering', 'Home-cooked meals, baked goods, and catering', 'restaurant'),
  ('Photography', 'Event and portrait photography services', 'photo_camera'),
  ('Fitness & Wellness', 'Personal training and wellness coaching', 'fitness_center'),
  ('Pet Care', 'Dog walking, pet sitting, and grooming', 'pets')
ON CONFLICT DO NOTHING;
