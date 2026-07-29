-- ============================================================
-- Local Link — Verification evidence migration
--
-- Run ONCE in Supabase: SQL Editor → New Query → paste → Run.
-- Idempotent: safe to re-run.
--
-- The "Get Verified" page asks a student for their university email and a
-- photo of their student ID, but there was nowhere to put either — so admins
-- were approving requests with literally nothing to review. This adds:
--   • verification_requests.edu_email    — the .edu address they claimed
--   • verification_requests.id_document  — path inside the private
--     `verification-docs` storage bucket
--   • the bucket itself + policies: a student may upload into their own
--     folder; only that student and admins may read it.
-- ============================================================

ALTER TABLE verification_requests
  ADD COLUMN IF NOT EXISTS edu_email   TEXT,
  ADD COLUMN IF NOT EXISTS id_document TEXT;

-- Private bucket (public = false): student IDs must never be world-readable.
INSERT INTO storage.buckets (id, name, public)
VALUES ('verification-docs', 'verification-docs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Files live at `<auth.uid()>/<timestamp>.<ext>`, so the first path segment
-- identifies the owner.
DROP POLICY IF EXISTS "Owner uploads verification doc" ON storage.objects;
CREATE POLICY "Owner uploads verification doc" ON storage.objects FOR INSERT
TO authenticated WITH CHECK (
  bucket_id = 'verification-docs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Owner replaces verification doc" ON storage.objects;
CREATE POLICY "Owner replaces verification doc" ON storage.objects FOR UPDATE
TO authenticated USING (
  bucket_id = 'verification-docs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Owner or admin reads verification doc" ON storage.objects;
CREATE POLICY "Owner or admin reads verification doc" ON storage.objects FOR SELECT
TO authenticated USING (
  bucket_id = 'verification-docs'
  AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin())
);

-- NOTE: `public.is_admin()` is created by backend/rls_policies.sql — run that
-- first (or at least the function definition at the top of it).
